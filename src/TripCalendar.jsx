import FullCalendar from '@fullcalendar/react'
import interactionPlugin from '@fullcalendar/interaction'
import timeGridPlugin from '@fullcalendar/timegrid'

function TripCalendar({ days, events, onEventDrop, onEventResize, onEventClick, dayLabelsOnly = false }) {
  const views = {
    tripSchedule: {
      type: 'timeGrid',
      duration: { days: days.length },
    },
  }
  const dayHeaderContent = dayLabelsOnly
    ? ({ date }) => {
        const dateISO = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        return days.find((day) => day.dateISO === dateISO)?.label ?? ''
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
        eventConstraint={{ start: '06:00', end: '23:00' }}
        eventLongPressDelay={300}
        events={events}
        eventDrop={onEventDrop}
        eventResize={onEventResize}
        eventClick={onEventClick}
        eventContent={({ event, timeText }) => (
          <div className="calendar-event-content">
            <span className="calendar-event-time">{timeText}</span>
            <strong>{event.title}</strong>
            <span className="calendar-event-type">{event.extendedProps.type}</span>
            {event.extendedProps.place && <span className="calendar-event-place">{event.extendedProps.place}</span>}
          </div>
        )}
      />
    </div>
  )
}

export default TripCalendar
