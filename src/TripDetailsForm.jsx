import { useState } from 'react'
import TripStopsEditor from './TripStopsEditor.jsx'

const currentYear = new Date().getFullYear()

function getISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatTripDateRange(startDateISO, tripDays) {
  const start = new Date(`${startDateISO}T12:00:00`)
  const end = new Date(start)
  end.setDate(start.getDate() + tripDays - 1)
  const format = (date, includeYear) => new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  }).format(date)
  if (start.getFullYear() !== end.getFullYear()) {
    return `${format(start, true)}–${format(end, true)}`
  }
  const startMonth = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(start)
  const endMonth = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(end)
  const year = end.getFullYear()
  return startMonth === endMonth
    ? `${startMonth} ${start.getDate()}–${end.getDate()}, ${year}`
    : `${format(start, false)}–${format(end, false)}, ${year}`
}

function TripDetailsForm({ trip, minTripDays = 1, onSave, onCancel }) {
  const [name, setName] = useState(trip.name)
  const [stops, setStops] = useState(() => {
    if (Array.isArray(trip.stops)) return trip.stops
    if (!trip.location && !trip.coordinates) return []
    return [{
      id: `${trip.id}-legacy-stop`,
      name: trip.location || 'Trip destination',
      details: trip.locationDetails ?? '',
      coordinates: trip.coordinates ?? null,
    }]
  })
  const [year, setYear] = useState(String(trip.year))
  const [startDateISO, setStartDateISO] = useState(trip.startDateISO ?? '')
  const [tripDays, setTripDays] = useState(String(trip.tripDays ?? trip.days ?? 1))
  const [vacationDays, setVacationDays] = useState(String(trip.vacationDays ?? 0))
  const [estimatedCost, setEstimatedCost] = useState(String(trip.estimatedCost ?? 0))
  const [formError, setFormError] = useState('')

  function changeYear(nextYear) {
    setYear(nextYear)
    if (!startDateISO || nextYear.length !== 4) return
    const numericYear = Number(nextYear)
    if (!Number.isInteger(numericYear) || numericYear < 1900) return
    const date = new Date(`${startDateISO}T12:00:00`)
    date.setFullYear(numericYear)
    const nextStartDate = getISODate(date)
    setStartDateISO(nextStartDate)
  }

  function changeStartDate(nextStartDate) {
    setStartDateISO(nextStartDate)
    if (!nextStartDate) return
    const nextYear = Number(nextStartDate.slice(0, 4))
    setYear(String(nextYear))
  }

  function changeTripDays(value) {
    setTripDays(value)
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (tripDays < minTripDays) {
      setFormError(`Keep at least ${minTripDays} days to preserve scheduled itinerary activities.`)
      return
    }
    setFormError('')
    const placeNames = stops.map((stop) => stop.name.trim()).filter(Boolean)
    onSave({
      ...trip,
      name: name.trim(),
      location: placeNames.join(', '),
      locationDetails: stops.map((stop) => stop.details).filter(Boolean).join(' · '),
      coordinates: stops[0]?.coordinates ?? null,
      stops,
      year: Number(year),
      dates: startDateISO
        ? formatTripDateRange(startDateISO, Number(tripDays))
        : trip.dates ?? '',
      startDateISO: startDateISO || null,
      tripDays: Number(tripDays),
      vacationDays: Number(vacationDays),
      estimatedCost: Number(estimatedCost),
    })
  }

  return (
    <form className="trip-create-form trip-details-form" onSubmit={handleSubmit}>
      <div className="section-heading compact-heading">
        <div>
          <p className="eyebrow">Trip details</p>
          <h3>Edit your trip</h3>
        </div>
        <button className="icon-button" type="button" onClick={onCancel} aria-label="Close trip details form">×</button>
      </div>
      <div className="trip-form-grid">
        <label className="form-field">
          <span>Trip name</span>
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="form-field">
          <span>Planning year</span>
          <input required type="number" min="1900" max={currentYear + 59} value={year} onChange={(event) => changeYear(event.target.value)} />
        </label>
        <label className="form-field">
          <span>Exact start date (optional)</span>
          <input type="date" value={startDateISO} onChange={(event) => changeStartDate(event.target.value)} />
          <small className="trip-form-note">Leave blank for a flexible date; the schedule will use relative trip days.</small>
        </label>
        <label className="form-field">
          <span>Trip length (days)</span>
          <input required type="number" min={minTripDays} value={tripDays} onChange={(event) => changeTripDays(event.target.value)} />
          {minTripDays > 1 && <small className="trip-form-note">At least {minTripDays} days are needed to keep existing scheduled activities.</small>}
        </label>
        <label className="form-field">
          <span>Vacation days (PTO)</span>
          <input required type="number" min="0" value={vacationDays} onChange={(event) => setVacationDays(event.target.value)} />
        </label>
        <label className="form-field">
          <span>Estimated trip cost ($)</span>
          <input required type="number" min="0" step="100" value={estimatedCost} onChange={(event) => setEstimatedCost(event.target.value)} />
        </label>
      </div>
      <TripStopsEditor stops={stops} onChange={setStops} />
      {formError && <p className="place-search-feedback search-error" role="alert">{formError}</p>}
      <div className="trip-form-actions">
        <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
        <button className="primary-button" type="submit" disabled={!name.trim()}>Save trip details</button>
      </div>
    </form>
  )
}

export default TripDetailsForm
