import { useState } from 'react'
import PlaceSearchInput from './PlaceSearchInput.jsx'

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
  const [location, setLocation] = useState(trip.location ?? '')
  const [locationDetails, setLocationDetails] = useState(trip.locationDetails ?? '')
  const [coordinates, setCoordinates] = useState(trip.coordinates ?? null)
  const [year, setYear] = useState(trip.year)
  const [dates, setDates] = useState(trip.dates ?? '')
  const [startDateISO, setStartDateISO] = useState(trip.startDateISO ?? '')
  const [tripDays, setTripDays] = useState(trip.tripDays ?? trip.days ?? 1)
  const [vacationDays, setVacationDays] = useState(trip.vacationDays ?? 0)
  const [estimatedCost, setEstimatedCost] = useState(trip.estimatedCost ?? 0)
  const [formError, setFormError] = useState('')

  function changeYear(nextYear) {
    setYear(nextYear)
    if (!startDateISO) return
    const date = new Date(`${startDateISO}T12:00:00`)
    date.setFullYear(nextYear)
    const nextStartDate = getISODate(date)
    setStartDateISO(nextStartDate)
    setDates(formatTripDateRange(nextStartDate, tripDays))
  }

  function changeStartDate(nextStartDate) {
    setStartDateISO(nextStartDate)
    if (!nextStartDate) return
    const nextYear = Number(nextStartDate.slice(0, 4))
    setYear(nextYear)
    setDates(formatTripDateRange(nextStartDate, tripDays))
  }

  function changeTripDays(value) {
    const nextTripDays = Number(value)
    setTripDays(nextTripDays)
    if (startDateISO && nextTripDays >= minTripDays) {
      setDates(formatTripDateRange(startDateISO, nextTripDays))
    }
  }

  function handleLocationChange(value) {
    setLocation(value)
    setLocationDetails('')
    setCoordinates(null)
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (tripDays < minTripDays) {
      setFormError(`Keep at least ${minTripDays} days to preserve scheduled itinerary activities.`)
      return
    }
    setFormError('')
    onSave({
      ...trip,
      name: name.trim(),
      location: location.trim(),
      locationDetails,
      coordinates,
      year,
      dates: dates.trim(),
      startDateISO: startDateISO || null,
      tripDays,
      vacationDays,
      estimatedCost,
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
        <div className="form-field">
          <span>Destination</span>
          <PlaceSearchInput
            ariaLabel="Destination"
            value={location}
            onChange={handleLocationChange}
            onSelect={(place) => {
              setLocation(place.name)
              setLocationDetails(place.details)
              setCoordinates(place.coordinates)
            }}
            details={locationDetails}
          />
        </div>
        <label className="form-field">
          <span>Planning year</span>
          <input required type="number" min={currentYear} max={currentYear + 59} value={year} onChange={(event) => changeYear(Number(event.target.value))} />
        </label>
        <label className="form-field">
          <span>Dates or season</span>
          <input value={dates} onChange={(event) => setDates(event.target.value)} placeholder="e.g. Spring · flexible" />
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
          <input required type="number" min="0" value={vacationDays} onChange={(event) => setVacationDays(Number(event.target.value))} />
        </label>
        <label className="form-field">
          <span>Estimated trip cost ($)</span>
          <input required type="number" min="0" step="100" value={estimatedCost} onChange={(event) => setEstimatedCost(Number(event.target.value))} />
        </label>
      </div>
      {formError && <p className="place-search-feedback search-error" role="alert">{formError}</p>}
      <div className="trip-form-actions">
        <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
        <button className="primary-button" type="submit" disabled={!name.trim()}>Save trip details</button>
      </div>
    </form>
  )
}

export default TripDetailsForm
