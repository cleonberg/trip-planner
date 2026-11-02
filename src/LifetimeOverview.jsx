import { useMemo, useState } from 'react'
import TripMap from './TripMap.jsx'
import PlaceSearchInput from './PlaceSearchInput.jsx'

const firstPlanningYear = new Date().getFullYear()
const planningYears = Array.from({ length: 120 }, (_, index) => firstPlanningYear - 60 + index)
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

function getYearPlan(annualPlans, year) {
  return annualPlans.find((plan) => plan.year === year) ?? { year, travelBudget: 0, vacationDays: 0 }
}

function LimitMeter({ label, actual, limit, format }) {
  const percentage = limit > 0 ? (actual / limit) * 100 : actual > 0 ? 100 : 0
  const overLimit = actual > limit
  return (
    <div className={`limit-meter${overLimit ? ' limit-meter-over' : ''}`}>
      <div className="limit-meter-heading">
        <span>{label}</span>
        <strong>{format(actual)} <span>/ {format(limit)}</span></strong>
      </div>
      <div
        className="limit-meter-track"
        role="progressbar"
        aria-label={`${label} used`}
        aria-valuenow={actual}
        aria-valuemin={0}
        aria-valuemax={limit}
      >
        <span style={{ width: `${Math.min(percentage, 100)}%` }} />
      </div>
      {overLimit && <small className="limit-warning">Over this year's plan by {format(actual - limit)}</small>}
    </div>
  )
}

function TripCard({ trip, onOpen, onYearChange, onDragStart }) {
  const tripYears = [...new Set([...planningYears, trip.year])].sort((first, second) => first - second)

  return (
    <article
      className="lifetime-trip-card"
      draggable
      onDragStart={(event) => onDragStart(event, trip)}
      aria-label={`${trip.name}, draggable trip plan`}
    >
      <div className="trip-card-topline">
        <span className={`trip-status status-${trip.status?.toLowerCase() ?? 'idea'}`}>{trip.status ?? 'Idea'}</span>
        <label className="trip-year-select">
          <span className="visually-hidden">Trip year</span>
          <select
            value={trip.year}
            onChange={(event) => onYearChange(trip.id, Number(event.target.value))}
            aria-label={`Move ${trip.name} to year`}
          >
            {tripYears.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
      </div>
      <h3>{trip.name}</h3>
      <p className="trip-card-location">{trip.location || 'Destination not set'}</p>
      <div className="trip-card-stats">
        <span>{trip.dates || `${trip.tripDays ?? trip.days} days`}</span>
        <span>{trip.vacationDays} PTO days</span>
        <strong>{currency.format(trip.estimatedCost)}</strong>
      </div>
      <button className="text-button" type="button" onClick={() => onOpen(trip)}>Open trip details →</button>
    </article>
  )
}

function TripForm({ onAddTrip, onCancel }) {
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [details, setDetails] = useState('')
  const [coordinates, setCoordinates] = useState(null)
  const [year, setYear] = useState(firstPlanningYear + 1)
  const [status, setStatus] = useState('Idea')
  const [days, setDays] = useState(5)
  const [vacationDays, setVacationDays] = useState(5)
  const [estimatedCost, setEstimatedCost] = useState(2500)

  function handlePlaceChange(nextLocation) {
    setLocation(nextLocation)
    setDetails('')
    setCoordinates(null)
  }

  function handleSubmit(event) {
    event.preventDefault()
    onAddTrip({
      id: `trip-${Date.now()}`,
      name: name.trim(),
      location: location.trim(),
      locationDetails: details,
      coordinates,
      year,
      tripDays: days,
      vacationDays,
      estimatedCost,
      status,
      dates: '',
    })
  }

  return (
    <form className="trip-create-form" onSubmit={handleSubmit}>
      <div className="section-heading compact-heading">
        <div>
          <p className="eyebrow">New trip</p>
          <h3>Add a past trip or a future adventure</h3>
        </div>
        <button className="icon-button" type="button" onClick={onCancel} aria-label="Close new trip form">×</button>
      </div>
      <div className="trip-form-grid">
        <label className="form-field">
          <span>Trip name</span>
          <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Japan spring trip" />
        </label>
        <div className="form-field">
          <span>Destination</span>
          <PlaceSearchInput
            value={location}
            onChange={handlePlaceChange}
            onSelect={(place) => {
              setLocation(place.name)
              setDetails(place.details)
              setCoordinates(place.coordinates)
            }}
            details={details}
          />
        </div>
        <label className="form-field">
          <span>Trip year</span>
          <input required type="number" min="1900" max={firstPlanningYear + 59} value={year} onChange={(event) => setYear(Number(event.target.value))} />
        </label>
        <label className="form-field">
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option>Visited</option>
            <option>Planning</option>
            <option>Idea</option>
          </select>
        </label>
        <label className="form-field">
          <span>Trip length (days)</span>
          <input required type="number" min="1" value={days} onChange={(event) => setDays(Number(event.target.value))} />
        </label>
        <label className="form-field">
          <span>Vacation days (PTO)</span>
          <input required type="number" min="0" value={vacationDays} onChange={(event) => setVacationDays(Number(event.target.value))} />
        </label>
        <label className="form-field">
          <span>Estimated trip cost ($)</span>
          <input required type="number" min="0" value={estimatedCost} onChange={(event) => setEstimatedCost(Number(event.target.value))} />
        </label>
      </div>
      <div className="trip-form-actions">
        <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
        <button className="primary-button" type="submit" disabled={!name.trim()}>Add trip</button>
      </div>
    </form>
  )
}

function LifetimeOverview({
  trips,
  wishlist,
  annualPlans,
  onTripYearChange,
  onUpdatePlan,
  onOpenTrip,
  onAddTrip,
}) {
  const [isAddingTrip, setIsAddingTrip] = useState(false)
  const years = useMemo(() => [...new Set([
    ...annualPlans.map((plan) => plan.year),
    ...trips.map((trip) => trip.year),
  ])].sort((a, b) => a - b), [annualPlans, trips])
  const markers = useMemo(() => [
    ...trips.filter((trip) => trip.coordinates).map((trip) => ({
      id: `trip-${trip.id}`,
      title: trip.name,
      place: trip.location,
      time: `${trip.year} · ${trip.status}`,
      mapStatus: trip.status?.toLowerCase() === 'visited' ? 'visited' : 'planned',
      coordinates: trip.coordinates,
    })),
    ...wishlist.filter((item) => item.coordinates).map((item) => ({
      id: `wish-${item.id}`,
      title: item.name ?? item.title,
      place: item.location,
      time: item.status,
      mapStatus: item.status.toLowerCase(),
      locationDetails: item.details ?? item.locationDetails,
      coordinates: item.coordinates,
    })),
  ], [trips, wishlist])
  const totalPto = trips.reduce((sum, trip) => sum + trip.vacationDays, 0)
  const totalCost = trips.reduce((sum, trip) => sum + trip.estimatedCost, 0)
  const locationCount = markers.length

  function handleDragStart(event, trip) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', trip.id)
  }

  function handleYearDrop(event, year) {
    event.preventDefault()
    const tripId = event.dataTransfer.getData('text/plain')
    if (tripId) onTripYearChange(tripId, year)
  }

  return (
    <main className="lifetime-page">
      <section className="lifetime-hero">
        <div>
          <p className="eyebrow">The long view</p>
          <h1>Make a lifetime of trips add up.</h1>
          <p>Record the places you’ve been and plan the adventures still ahead, all in one lifetime view.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => setIsAddingTrip((open) => !open)}>
          {isAddingTrip ? 'Close form' : '+ Plan a trip'}
        </button>
      </section>

      <section className="lifetime-stat-grid" aria-label="Lifetime travel summary">
        <article className="lifetime-stat-card"><span>Trips recorded</span><strong>{trips.length}</strong><small>across past and future years</small></article>
        <article className="lifetime-stat-card"><span>Wish-list ideas</span><strong>{wishlist.length}</strong><small>ready to fit into a trip</small></article>
        <article className="lifetime-stat-card"><span>Vacation days planned</span><strong>{totalPto}</strong><small>days across all trips</small></article>
        <article className="lifetime-stat-card"><span>Trip estimates</span><strong>{currency.format(totalCost)}</strong><small>rough planning totals</small></article>
      </section>

      {isAddingTrip && (
        <TripForm
          onCancel={() => setIsAddingTrip(false)}
          onAddTrip={(trip) => {
            onAddTrip(trip)
            setIsAddingTrip(false)
          }}
        />
      )}

      <section className="lifetime-map-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Places in your plans</p>
            <h2>Your travel map</h2>
          </div>
          <p>{locationCount} mapped {locationCount === 1 ? 'place' : 'places'}</p>
        </div>
        {markers.length > 0
          ? <TripMap activities={markers} />
          : <p className="empty-map-message">Add a destination or wish-list place to start mapping your travel plans.</p>}
        <div className="map-legend" aria-label="Map legend">
          <span><i className="legend-dot legend-planned" /> Planned trip</span>
          <span><i className="legend-dot legend-wishlist" /> Wish list</span>
          <span><i className="legend-dot legend-visited" /> Visited</span>
        </div>
      </section>

      <section className="year-planner-section">
        <div className="section-heading year-planner-heading">
          <div>
            <p className="eyebrow">Time, money, and possibility</p>
            <h2>Trips by year</h2>
          </div>
          <p>Drag a trip into another year, or use its year menu. Edit each year’s budget and PTO limits.</p>
        </div>
        <div className="year-board">
          {years.map((year) => {
            const yearTrips = trips.filter((trip) => trip.year === year)
            const plan = getYearPlan(annualPlans, year)
            const plannedCost = yearTrips.reduce((sum, trip) => sum + trip.estimatedCost, 0)
            const plannedPto = yearTrips.reduce((sum, trip) => sum + trip.vacationDays, 0)
            return (
              <section
                className="year-column"
                key={year}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleYearDrop(event, year)}
                aria-label={`Trips planned for ${year}`}
              >
                <header className="year-column-header">
                  <div><h3>{year}</h3><span>{yearTrips.length} {yearTrips.length === 1 ? 'trip' : 'trips'}</span></div>
                </header>
                <div className="year-planning-summary">
                  <div className="annual-limits">
                    <label>
                      <span>Travel budget</span>
                      <span className="annual-input-wrap">$<input type="number" min="0" step="100" value={plan.travelBudget} onChange={(event) => onUpdatePlan(year, 'travelBudget', Number(event.target.value))} aria-label={`${year} travel budget`} /></span>
                    </label>
                    <label>
                      <span>Vacation days</span>
                      <span className="annual-input-wrap"><input type="number" min="0" step="1" value={plan.vacationDays} onChange={(event) => onUpdatePlan(year, 'vacationDays', Number(event.target.value))} aria-label={`${year} vacation days`} /> <small>days</small></span>
                    </label>
                  </div>
                  <LimitMeter label="Trip costs" actual={plannedCost} limit={plan.travelBudget} format={currency.format} />
                  <LimitMeter label="Time off" actual={plannedPto} limit={plan.vacationDays} format={(value) => `${value} days`} />
                </div>
                <div className="year-trip-list">
                  {yearTrips.length > 0
                    ? yearTrips.map((trip) => (
                      <TripCard
                        key={trip.id}
                        trip={trip}
                        onOpen={onOpenTrip}
                        onYearChange={onTripYearChange}
                        onDragStart={handleDragStart}
                      />
                    ))
                    : <p className="year-drop-hint">Drop a trip here or add a new trip.</p>}
                </div>
              </section>
            )
          })}
        </div>
      </section>
    </main>
  )
}

export default LifetimeOverview
