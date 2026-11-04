import FullCalendar from '@fullcalendar/react'
import interactionPlugin from '@fullcalendar/interaction'
import timeGridPlugin from '@fullcalendar/timegrid'

function DayCalendar({ dayId, date, events, eventAllow, onTimeSelect, onEventDrop, onEventResize, onEventClick }) {
  return (
    <FullCalendar
      key={dayId}
      plugins={[timeGridPlugin, interactionPlugin]}
      initialView="timeGridDay"
      initialDate={date}
      headerToolbar={false}
      dayHeaders={false}
      allDaySlot={false}
      slotMinTime="06:00:00"
      slotMaxTime="23:00:00"
      slotDuration="00:30:00"
      snapDuration="00:15:00"
      slotLabelInterval="01:00:00"
      scrollTime="08:00:00"
      height="auto"
      selectable
      selectMirror
      editable
      eventStartEditable
      eventDurationEditable
      eventResizableFromStart
      eventAllow={eventAllow}
      eventLongPressDelay={300}
      selectLongPressDelay={300}
      events={events}
      select={onTimeSelect}
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
  )
}

export default DayCalendar
