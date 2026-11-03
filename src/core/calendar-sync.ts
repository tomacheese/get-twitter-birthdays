import type { Auth } from 'googleapis'
import type {
  BirthdayEntry,
  BirthdaysOutput,
  CalendarEventRecord,
  CalendarEventsStorage,
} from '../shared/types'
import {
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from '../infra/calendar-client'
import { loadCalendarEvents, saveCalendarEvents } from '../infra/storage'
import {
  SYNC_CALENDAR_RECONCILE,
  SYNC_CALENDAR_RECONCILE_MAX_DELETIONS,
} from '../shared/config'

type OAuth2Client = Auth.OAuth2Client

/** Conditions for a sync run. */
export interface SyncOptions {
  /** Whether the following list was fetched completely */
  followingComplete: boolean
}

/**
 * Returns a copy of the event records without the given user.
 *
 * @param events Event records
 * @param userId User ID to remove
 * @returns New event records
 */
function removeEventByUserId(
  events: CalendarEventsStorage,
  userId: string
): CalendarEventsStorage {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { [userId]: _removed, ...rest } = events
  return rest
}

/**
 * Checks whether a recorded event differs from the current birthday entry.
 *
 * @param record Existing event record
 * @param entry Birthday entry
 * @returns True if changed
 */
function hasEventChanged(
  record: CalendarEventRecord,
  entry: BirthdayEntry
): boolean {
  return (
    record.name !== entry.name ||
    record.screenName !== entry.screenName ||
    record.birthdate.day !== entry.birthdate.day ||
    record.birthdate.month !== entry.birthdate.month ||
    record.birthdate.year !== entry.birthdate.year ||
    record.profileUrl !== entry.profileUrl
  )
}

/**
 * Returns why reconcile deletions must be skipped, if they must.
 *
 * When the fetched data cannot be trusted as a complete snapshot, or the number of deletions looks abnormal,
 * all deletions are skipped so that existing events are not lost.
 *
 * @param candidateCount Number of deletion candidates
 * @param trackedCount Number of recorded events
 * @param birthdayCount Number of birthdays fetched in this run
 * @param followingComplete Whether the following list was fetched completely
 * @returns Message to log when deletions must be skipped, or undefined when they are allowed
 */
function getReconcileSkipReason(
  candidateCount: number,
  trackedCount: number,
  birthdayCount: number,
  followingComplete: boolean
): string | undefined {
  if (candidateCount === 0) {
    return undefined
  }
  if (!followingComplete) {
    return `Skipping deletions because the following list was not fetched completely (candidates: ${candidateCount})`
  }
  if (birthdayCount === 0 && trackedCount > 0) {
    return `Skipping deletions because no birthdays were fetched (candidates: ${candidateCount})`
  }
  const maxDeletions = SYNC_CALENDAR_RECONCILE_MAX_DELETIONS
  return maxDeletions > 0 && candidateCount > maxDeletions
    ? `Skipping deletions because ${candidateCount} candidates exceed the limit of ${maxDeletions}. If this is expected, raise SYNC_CALENDAR_RECONCILE_MAX_DELETIONS and run again`
    : undefined
}

/**
 * Syncs birthdays to Google Calendar.
 *
 * Per-user failures are collected and processing continues with the other users; an error is thrown at the end if any failed.
 * The event records are saved after every create/update/delete, so events created before a crash are not created again.
 *
 * @param oauth2Client Authenticated OAuth2Client
 * @param birthdaysOutput Birthdays to sync
 * @param options Sync conditions
 */
export async function syncToGoogleCalendar(
  oauth2Client: OAuth2Client,
  birthdaysOutput: BirthdaysOutput,
  options: SyncOptions
): Promise<void> {
  console.log('📅 Starting Google Calendar sync...')

  let events = loadCalendarEvents()
  const currentUserIds = new Set(birthdaysOutput.birthdays.map((b) => b.id))
  let created = 0
  let updated = 0
  let skipped = 0
  let deleted = 0
  const errors: { user: string; error: unknown }[] = []

  // Create or update
  for (const entry of birthdaysOutput.birthdays) {
    const existingEvent = events[entry.id]

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!existingEvent) {
      try {
        const eventId = await createCalendarEvent(
          oauth2Client,
          entry.id,
          entry.name,
          entry.screenName,
          entry.birthdate,
          entry.profileUrl
        )

        events[entry.id] = {
          eventId,
          userId: entry.id,
          name: entry.name,
          screenName: entry.screenName,
          birthdate: entry.birthdate,
          profileUrl: entry.profileUrl,
          updatedAt: new Date().toISOString(),
        }

        // Save right after creating the event to avoid duplicates after a crash
        saveCalendarEvents(events)

        console.log(`  ✅ Created: ${entry.name}(@${entry.screenName})`)
        created++
      } catch (error) {
        console.error(
          `  ❌ Failed to create: ${entry.name}(@${entry.screenName})`,
          error
        )
        errors.push({
          user: `${entry.name}(@${entry.screenName})`,
          error,
        })
      }
    } else if (hasEventChanged(existingEvent, entry)) {
      try {
        await updateCalendarEvent(
          oauth2Client,
          existingEvent.eventId,
          entry.id,
          entry.name,
          entry.screenName,
          entry.birthdate,
          entry.profileUrl
        )

        events[entry.id] = {
          ...existingEvent,
          name: entry.name,
          screenName: entry.screenName,
          birthdate: entry.birthdate,
          profileUrl: entry.profileUrl,
          updatedAt: new Date().toISOString(),
        }

        // Save right after updating the event so the record never lags behind the calendar
        saveCalendarEvents(events)

        console.log(`  🔄 Updated: ${entry.name}(@${entry.screenName})`)
        updated++
      } catch (error) {
        console.error(
          `  ❌ Failed to update: ${entry.name}(@${entry.screenName})`,
          error
        )
        errors.push({
          user: `${entry.name}(@${entry.screenName})`,
          error,
        })
      }
    } else {
      skipped++
    }
  }

  // Reconcile: delete events of users that are no longer in the birthdays
  if (SYNC_CALENDAR_RECONCILE) {
    const removedUserIds = Object.keys(events).filter(
      (userId) => !currentUserIds.has(userId)
    )
    const skipReason = getReconcileSkipReason(
      removedUserIds.length,
      Object.keys(events).length,
      birthdaysOutput.birthdays.length,
      options.followingComplete
    )
    if (skipReason) {
      console.warn(`  ⚠️ ${skipReason}`)
    }
    const deletionTargets = skipReason ? [] : removedUserIds

    for (const userId of deletionTargets) {
      const record = events[userId]
      try {
        await deleteCalendarEvent(oauth2Client, record.eventId)
        events = removeEventByUserId(events, userId)

        saveCalendarEvents(events)

        console.log(`  🗑️  Deleted: ${record.name}(@${record.screenName})`)
        deleted++
      } catch (error) {
        console.error(
          `  ❌ Failed to delete: ${record.name}(@${record.screenName})`,
          error
        )
        errors.push({
          user: `${record.name}(@${record.screenName})`,
          error,
        })
      }
    }
  }

  saveCalendarEvents(events)

  console.log()
  console.log('✅ Sync completed')
  console.log(
    `  📊 Created: ${created}, updated: ${updated}, skipped: ${skipped}, deleted: ${deleted}`
  )

  if (errors.length === 0) {
    return
  }

  console.log()
  console.log(`⚠️ ${errors.length} error(s) occurred:`)
  for (const { user, error } of errors) {
    console.log(
      `  - ${user}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  throw new Error(`❌ Sync failed for ${errors.length} user(s)`)
}
