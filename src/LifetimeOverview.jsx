import { useMemo, useState } from 'react'
import TripMap from './TripMap.jsx'
import TripStopsEditor from './TripStopsEditor.jsx'

const firstPlanningYear = new Date().getFullYear()
const planningYears = Array.from({ length: 120 }, (_, index) => firstPlanningYear - 60 + index)
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

function getYearPlan(annualPlans, year) {
  return annualPlans.find((plan) => plan.year === year) ?? { year, travelBudget: 0, vacationDays: 0 }
}

function getTripDestinations(trip) {
  const stops = Array.isArray(trip.stops) ? trip.stops.filter((stop) => stop.name?.trim()) : []
  return stops.length ? stops.map((stop) => stop.name) : [trip.location].filter(Boolean)
}

function getTripCountries(trip) {
  const stops = Array.isArray(trip.stops) ? trip.stops.filter((stop) => stop.details?.trim()) : []
  const locations = stops.map((stop) => stop.details)
  if (!locations.length && (trip.locationDetails || trip.location)) {
    locations.push(trip.locationDetails || trip.location)
  }
  return locations
    .map((location) => location.split(',').map((part) => part.trim()).filter(Boolean).at(-1))
    .filter(Boolean)
}

function countUniqueTripValues(trips, getValues) {
  return new Set(trips.flatMap(getValues).map((value) => value.trim().toLowerCase()).filter(Boolean)).size
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

function YearPlanningSummary({ year, plan, plannedCost, plannedPto, onUpdatePlan }) {
  const [isOpen, setIsOpen] = useState(false)
  const detailsId = `year-planning-details-${year}`

  return (
    <div className={`year-planning-summary${isOpen ? ' year-planning-summary-open' : ''}`}>
      <button
        className="year-planning-summary-toggle"
        type="button"
        aria-expanded={isOpen}
        aria-controls={detailsId}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span>Budget &amp; vacation days</span>
        <span className="year-planning-summary-chevron" aria-hidden="true" />
      </button>
      <div className="year-planning-summary-details" id={detailsId}>
        <div className="annual-limits">
          <label>
            <span>Travel budget</span>
            <AnnualPlanNumberField
              key={`${year}-travelBudget-${plan.travelBudget}`}
              year={year}
              field="travelBudget"
              value={plan.travelBudget}
              ariaLabel={`${year} travel budget`}
              prefix="$"
              onUpdatePlan={onUpdatePlan}
            />
          </label>
          <label>
            <span>Vacation days</span>
            <AnnualPlanNumberField
              key={`${year}-vacationDays-${plan.vacationDays}`}
              year={year}
              field="vacationDays"
              value={plan.vacationDays}
              ariaLabel={`${year} vacation days`}
              suffix={<small>days</small>}
              onUpdatePlan={onUpdatePlan}
            />
          </label>
        </div>
        <LimitMeter label="Trip costs" actual={plannedCost} limit={plan.travelBudget} format={currency.format} />
        <LimitMeter label="Time off" actual={plannedPto} limit={plan.vacationDays} format={(value) => `${value} days`} />
      </div>
    </div>
  )
}

function AnnualPlanNumberField({ year, field, value, ariaLabel, prefix, suffix, onUpdatePlan }) {
  const [draft, setDraft] = useState(String(value))

  function commitValue() {
    const nextValue = draft.trim() ? Number(draft) : 0
    if (Number.isFinite(nextValue)) {
      onUpdatePlan(year, field, nextValue)
      setDraft(String(nextValue))
    } else {
      setDraft(String(value))
    }
  }

  return (
    <span className="annual-input-wrap">
      {prefix}
      <input
        type="number"
        min="0"
        step={field === 'travelBudget' ? 100 : 1}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitValue}
        aria-label={ariaLabel}
      />
      {suffix}
    </span>
  )
}

function TripCard({ trip, onOpen, onYearChange, onDragStart }) {
  const tripYears = [...new Set([...planningYears, trip.year])].sort((first, second) => first - second)
  const cardClassification = trip.status?.toLowerCase() === 'visited' ? 'visited' : 'planned'

  return (
    <article
      className={`lifetime-trip-card trip-card-${cardClassification}`}
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
  const [stops, setStops] = useState([])
  const [year, setYear] = useState(String(firstPlanningYear + 1))
  const [status, setStatus] = useState('Idea')
  const [days, setDays] = useState('5')
  const [vacationDays, setVacationDays] = useState('5')
  const [estimatedCost, setEstimatedCost] = useState('2500')

  function handleSubmit(event) {
    event.preventDefault()
    const placeNames = stops.map((stop) => stop.name.trim()).filter(Boolean)
    onAddTrip({
      id: `trip-${Date.now()}`,
      name: name.trim(),
      location: placeNames.join(', '),
      locationDetails: stops.map((stop) => stop.details).filter(Boolean).join(' · '),
      coordinates: stops[0]?.coordinates ?? null,
      stops,
      year: Number(year),
      tripDays: Number(days),
      vacationDays: Number(vacationDays),
      estimatedCost: Number(estimatedCost),
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
        <label className="form-field">
          <span>Trip year</span>
          <input required type="number" min="1900" max={firstPlanningYear + 59} value={year} onChange={(event) => setYear(event.target.value)} />
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
          <input required type="number" min="1" value={days} onChange={(event) => setDays(event.target.value)} />
        </label>
        <label className="form-field">
          <span>Vacation days (PTO)</span>
          <input required type="number" min="0" value={vacationDays} onChange={(event) => setVacationDays(event.target.value)} />
        </label>
        <label className="form-field">
          <span>Estimated trip cost ($)</span>
          <input required type="number" min="0" value={estimatedCost} onChange={(event) => setEstimatedCost(event.target.value)} />
        </label>
      </div>
      <TripStopsEditor stops={stops} onChange={setStops} />
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
  const [showPreviousYears, setShowPreviousYears] = useState(false)
  const [mapFilters, setMapFilters] = useState({ planned: true, visited: true, wishlist: true })
  const years = useMemo(() => [...new Set([
    ...annualPlans.map((plan) => plan.year),
    ...trips.map((trip) => trip.year),
  ])].sort((a, b) => a - b), [annualPlans, trips])
  const previousYears = years.filter((year) => year < firstPlanningYear)
  const visibleYears = showPreviousYears
    ? years
    : years.filter((year) => year >= firstPlanningYear)
  const markers = useMemo(() => [
    ...trips.flatMap((trip) => {
      const tripStatus = trip.status?.toLowerCase() === 'visited' ? 'visited' : 'planned'
      const stops = Array.isArray(trip.stops) ? trip.stops : []
      if (stops.length) {
        return stops
          .filter((stop) => stop.coordinates)
          .map((stop, index) => ({
            id: `trip-${trip.id}-stop-${stop.id ?? index}`,
            tripId: trip.id,
            title: stop.name,
            place: stop.name,
            time: `${trip.name} · ${trip.year} · ${trip.status}`,
            mapStatus: tripStatus,
            mapCategory: tripStatus,
            mapRadius: 7,
            locationDetails: stop.details,
            coordinates: stop.coordinates,
          }))
      }

      return trip.coordinates ? [{
        id: `trip-${trip.id}`,
        tripId: trip.id,
        title: trip.name,
        place: trip.location,
        time: `${trip.year} · ${trip.status}`,
        mapStatus: tripStatus,
        mapCategory: tripStatus,
        coordinates: trip.coordinates,
      }] : []
    }),
    ...wishlist.filter((item) => !item.tripId && item.coordinates).map((item) => ({
      id: `wish-${item.id}`,
      title: item.name ?? item.title,
      place: item.location,
      time: item.status,
      mapStatus: item.status.toLowerCase(),
      mapCategory: 'wishlist',
      mapColor: '#e27a21',
      mapRadius: 12,
      locationDetails: item.details ?? item.locationDetails,
      coordinates: item.coordinates,
    })),
  ], [trips, wishlist])
  const visibleMarkers = markers.filter((marker) => mapFilters[marker.mapCategory])
  const visitedTrips = trips.filter((trip) => trip.status?.toLowerCase() === 'visited')
  const plannedTrips = trips.filter((trip) => trip.status?.toLowerCase() !== 'visited')
  const visitedWishlistCount = wishlist.filter((item) => item.status?.toLowerCase() === 'visited').length
  const leftWishlistCount = wishlist.length - visitedWishlistCount
  const visitedDestinationCount = countUniqueTripValues(visitedTrips, getTripDestinations)
  const plannedDestinationCount = countUniqueTripValues(plannedTrips, getTripDestinations)
  const visitedCountryCount = countUniqueTripValues(visitedTrips, getTripCountries)
  const plannedCountryCount = countUniqueTripValues(plannedTrips, getTripCountries)
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

  function handleTripMarkerClick(tripId) {
    const trip = trips.find((currentTrip) => currentTrip.id === tripId)
    if (trip) onOpenTrip(trip)
  }

  return (
    <main className="lifetime-page">
      <section className="lifetime-stat-grid" aria-label="Lifetime travel summary">
        <article className="lifetime-stat-card">
          <span>Trips taken / planned</span>
          <strong>{visitedTrips.length} / {plannedTrips.length}</strong>
          <small>{visitedDestinationCount} / {plannedDestinationCount} destinations</small>
        </article>
        <article className="lifetime-stat-card">
          <span>Wish-list ideas</span>
          <strong>{visitedWishlistCount} / {leftWishlistCount}</strong>
          <small>visited / left</small>
        </article>
        <article className="lifetime-stat-card">
          <span>Countries visited / planned</span>
          <strong>{visitedCountryCount} / {plannedCountryCount}</strong>
          <small>unique countries</small>
        </article>
        <article className="lifetime-stat-card"><span>Trip estimates</span><strong>{currency.format(totalCost)}</strong><small>rough planning totals</small></article>
      </section>

      <section className="lifetime-map-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Places in your plans</p>
            <h2>Your travel map</h2>
          </div>
          <p>{locationCount} mapped {locationCount === 1 ? 'place' : 'places'}</p>
        </div>
        {markers.length > 0
          ? <TripMap
            activities={visibleMarkers}
            fitActivities={markers}
            onTripMarkerClick={handleTripMarkerClick}
            showToolbar
            scrollWheelZoom
            mapFilters={mapFilters}
            onMapFilterChange={(category) => setMapFilters((currentFilters) => ({
              ...currentFilters,
              [category]: !currentFilters[category],
            }))}
          />
          : <p className="empty-map-message">Add a key place or unassigned wish-list place to start mapping your travel plans.</p>}
        <div className="map-legend" aria-label="Map legend">
          <span><i className="legend-dot legend-planned" /> Planned trip</span>
          <span><i className="legend-dot legend-unassigned" /> Unassigned wish list</span>
          <span><i className="legend-dot legend-visited" /> Visited</span>
        </div>
      </section>

      <section className="year-planner-section">
        <div className="section-heading year-planner-heading">
          <div>
            <h2>Trips by year</h2>
          </div>
          <div className="year-planner-controls">
            <button className="primary-button" type="button" onClick={() => setIsAddingTrip((open) => !open)}>
              {isAddingTrip ? 'Close form' : '+ Add a trip'}
            </button>
            {previousYears.length > 0 && (
              <button
                className="previous-years-toggle"
                type="button"
                aria-expanded={showPreviousYears}
                aria-controls="year-board"
                onClick={() => setShowPreviousYears((visible) => !visible)}
              >
                <span>{showPreviousYears ? 'Hide' : 'Show'} previous years</span>
                <span className="previous-years-toggle-count">{previousYears.length}</span>
                <span className="previous-years-toggle-chevron" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        {isAddingTrip && (
          <TripForm
            onCancel={() => setIsAddingTrip(false)}
            onAddTrip={(trip) => {
              onAddTrip(trip)
              setIsAddingTrip(false)
            }}
          />
        )}
        <div className="year-board" id="year-board">
          {visibleYears.map((year) => {
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
                <YearPlanningSummary
                  year={year}
                  plan={plan}
                  plannedCost={plannedCost}
                  plannedPto={plannedPto}
                  onUpdatePlan={onUpdatePlan}
                />
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
