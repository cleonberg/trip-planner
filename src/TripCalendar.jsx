import FullCalendar from '@fullcalendar/react'
import interactionPlugin from '@fullcalendar/interaction'
import timeGridPlugin from '@fullcalendar/timegrid'

const shortDateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

function TripCalendar({
  days,
  events,
  eventAllow,
  onEventDrop,
  onEventResize,
  onEventClick,
  dayLabelsOnly = false,
  showDayDates = false,
}) {
  const views = {
    tripSchedule: {
      type: 'timeGrid',
      duration: { days: days.length },
    },
  }
  const dayHeaderContent = dayLabelsOnly
    ? ({ date }) => {
        const dateISO = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      const day = days.find((candidate) => candidate.dateISO === dateISO)
      if (!day) return ''
      return (
        <span className="trip-calendar-day-header">
          <strong>{day.label}</strong>
          {showDayDates && (
            <time dateTime={day.dateISO}>
              {shortDateFormatter.format(date)}
            </time>
          )}
        </span>
      )
    }
    : undefined

  return (
    <div
      className="trip-overview-calendar"
      style={{ '--trip-calendar-min-width': `${Math.max(620, days.length * 180)}px` }}
    >
      <FullCalendar
        plugins={[timeGridPlugin, interactionPlugin]}
        initialView="tripSchedule"
        initialDate={days[0]?.dateISO}
        views={views}
        headerToolbar={false}
        dayHeaderContent={dayHeaderContent}
        dayHeaderFormat={dayLabelsOnly ? undefined : { weekday: 'short', month: 'short', day: 'numeric' }}
        allDaySlot={false}
        slotMinTime="06:00:00"
        slotMaxTime="23:00:00"
        slotDuration="00:30:00"
        snapDuration="00:15:00"
        slotLabelInterval="01:00:00"
        scrollTime="08:00:00"
        height="auto"
        editable
        eventStartEditable
        eventDurationEditable
        eventResizableFromStart
        eventAllow={eventAllow}
        eventLongPressDelay={300}
        events={events}
        eventDrop={onEventDrop}
        eventResize={onEventResize}
        eventClick={onEventClick}
        eventDidMount={({ event, el }) => {
          if (event.extendedProps.kind === 'travel') {
            el.title = `${event.title} · ${event.extendedProps.type}`
          }
        }}
        eventContent={({ event, timeText }) => {
          const duration = event.end?.getTime() - event.start?.getTime()
          const isShortEvent = Number.isFinite(duration) && duration <= 60 * 60 * 1000
          const isShortTravel = event.extendedProps.kind === 'travel'
            && Number.isFinite(duration)
            && duration <= 30 * 60 * 1000

          if (isShortTravel) {
            return (
              <div className="calendar-event-content calendar-event-content-travel-short">
                <span className="calendar-event-time">{timeText}</span>
                <strong>{event.extendedProps.mode} · {event.extendedProps.durationLabel}</strong>
              </div>
            )
          }

          return (
            <div className={`calendar-event-content${isShortEvent ? ' calendar-event-content-compact' : ''}`}>
              <span className="calendar-event-time">{timeText}</span>
              <strong>{event.title}</strong>
              {!isShortEvent && (
                <>
                  <span className="calendar-event-type">{event.extendedProps.type}</span>
                  {event.extendedProps.place && <span className="calendar-event-place">{event.extendedProps.place}</span>}
                </>
              )}
            </div>
          )
        }}
      />
    </div>
  )
}

export default TripCalendar
