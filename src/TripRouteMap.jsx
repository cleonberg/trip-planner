import { useEffect, useMemo, useState } from 'react'
import TripMap from './TripMap.jsx'
import { getDrivingRoute } from './routing.js'

const routeCache = new Map()

function isCoordinates(value) {
  return value
    && Number.isFinite(value.lat)
    && Number.isFinite(value.lng)
    && value.lat >= -90
    && value.lat <= 90
    && value.lng >= -180
    && value.lng <= 180
}

function buildRoutePlan(items) {
  const nodes = items.flatMap((item) => {
    if (item.type === 'Flight') {
      const origin = isCoordinates(item.originCoordinates)
        ? {
            name: item.origin || 'Flight origin',
            place: item.origin,
            locationDetails: item.originDetails,
            coordinates: item.originCoordinates,
          }
        : null
      const destination = isCoordinates(item.destinationCoordinates)
        ? {
            name: item.destination || 'Flight destination',
            place: item.destination,
            locationDetails: item.destinationDetails,
            coordinates: item.destinationCoordinates,
          }
        : null

      if (origin && destination) {
        return [{ ...origin, flightToNext: true }, destination]
      }
      return [...(origin ? [origin] : []), null, ...(destination ? [destination] : [])]
    }

    return [isCoordinates(item.coordinates)
      ? {
          name: item.title,
          place: item.place,
          locationDetails: item.locationDetails,
          coordinates: item.coordinates,
        }
      : null]
  })

  const edges = []
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const from = nodes[index]
    const to = nodes[index + 1]
    if (!from || !to) continue
    edges.push({
      from,
      to,
      type: from.flightToNext ? 'flight' : 'driving',
    })
  }

  const drivingRuns = []
  edges.forEach((edge, index) => {
    if (edge.type !== 'driving') return
    const currentRun = drivingRuns[drivingRuns.length - 1]
    if (currentRun && currentRun.lastNode === edge.from) {
      currentRun.nodes.push(edge.to)
      currentRun.edgeIndexes.push(index)
      currentRun.lastNode = edge.to
    } else {
      drivingRuns.push({
        nodes: [edge.from, edge.to],
        edgeIndexes: [index],
        lastNode: edge.to,
      })
    }
  })

  return {
    edges,
    drivingRuns,
    mapActivities: nodes.filter(Boolean).map((node, index) => ({
      id: `${node.name}-${node.coordinates.lat}-${node.coordinates.lng}-${index}`,
      title: node.name,
      place: node.place,
      locationDetails: node.locationDetails,
      coordinates: node.coordinates,
      mapColor: node.flightToNext ? '#a15e39' : undefined,
    })),
    hasUnlocatedItems: items.some((item) => item.type === 'Flight'
      ? !isCoordinates(item.originCoordinates) || !isCoordinates(item.destinationCoordinates)
      : !isCoordinates(item.coordinates)),
  }
}

function formatTravelTime(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60))
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (!hours) return `${minutes} min`
  return remainingMinutes ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`
}

function formatDistance(meters) {
  const miles = meters / 1609.344
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`
}

function getRouteKey(edges) {
  return JSON.stringify(edges.map((edge) => [
    edge.type,
    edge.from.name,
    edge.from.coordinates.lat,
    edge.from.coordinates.lng,
    edge.to.name,
    edge.to.coordinates.lat,
    edge.to.coordinates.lng,
  ]))
}

function TripRouteMap({ items, dayLabel, embedded = false, scrollWheelZoom = false }) {
  const [routeResult, setRouteResult] = useState(null)
  const [retryCount, setRetryCount] = useState(0)
  const plan = useMemo(() => buildRoutePlan(items), [items])
  const routeKey = getRouteKey(plan.edges)
  const currentResult = routeResult?.key === routeKey ? routeResult : null
  const cachedResult = routeCache.get(routeKey)
  const routeData = currentResult?.route ?? cachedResult ?? null
  const routeError = currentResult?.error ?? ''
  const hasDrivingRoutes = plan.drivingRuns.length > 0
  const isLoading = hasDrivingRoutes && !routeData && !routeError
  const routeSegments = [
    ...plan.edges
      .filter((edge) => edge.type === 'flight')
      .map((edge) => ({
        type: 'flight',
        coordinates: [
          [edge.from.coordinates.lat, edge.from.coordinates.lng],
          [edge.to.coordinates.lat, edge.to.coordinates.lng],
        ],
      })),
    ...(routeData?.segments ?? []),
  ]
  const routeLegs = routeData?.legs ?? plan.edges
    .filter((edge) => edge.type === 'flight')
    .map((edge) => ({ ...edge, type: 'flight' }))

  useEffect(() => {
    if (!hasDrivingRoutes || routeCache.has(routeKey) || currentResult?.route) return undefined

    const controller = new AbortController()
    async function loadRoutes() {
      try {
        const segments = []
        const legs = new Array(plan.edges.length)
        plan.edges.forEach((edge, index) => {
          if (edge.type === 'flight') {
            legs[index] = { ...edge, type: 'flight' }
          }
        })

        await Promise.all(plan.drivingRuns.map(async (run) => {
          const route = await getDrivingRoute(
            run.nodes.map((node) => node.coordinates),
            controller.signal,
          )
          if (route.legs.length !== run.edgeIndexes.length) {
            throw new Error('Routing service could not find a complete driving route')
          }

          segments.push({
            type: 'driving',
            coordinates: route.coordinates,
          })
          run.edgeIndexes.forEach((edgeIndex, index) => {
            legs[edgeIndex] = { ...plan.edges[edgeIndex], ...route.legs[index], type: 'driving' }
          })
        }))

        const nextRoute = { segments, legs }
        routeCache.set(routeKey, nextRoute)
        setRouteResult({ key: routeKey, route: nextRoute, error: '' })
      } catch (error) {
        if (error.name !== 'AbortError') {
          setRouteResult({
            key: routeKey,
            route: null,
            error: error instanceof Error
              ? `Driving directions are unavailable: ${error.message}`
              : 'Driving directions are unavailable. Check your connection and try again.',
          })
        }
      }
    }

    loadRoutes()
    return () => controller.abort()
  }, [currentResult?.route, hasDrivingRoutes, plan, retryCount, routeKey])

  return (
    <section className={`trip-route-section${embedded ? ' trip-route-section-embedded' : ''}`} aria-label="Map and directions">
      {!embedded && (
        <div className="trip-route-heading">
          <div><p className="eyebrow">{dayLabel}</p><h3>Map &amp; directions</h3></div>
          <span>Driving routes · straight-line flights</span>
        </div>
      )}
      <div className="trip-route-layout">
        <div className="trip-route-map">
          <TripMap activities={plan.mapActivities} routeSegments={routeSegments} scrollWheelZoom={scrollWheelZoom} />
        </div>
        <div className="trip-route-details" aria-live="polite">
          {isLoading && <p>Calculating driving directions…</p>}
          {routeError && (
            <div className="trip-route-error" role="alert">
              <p>{routeError}</p>
              <button type="button" onClick={() => {
                routeCache.delete(routeKey)
                setRouteResult({ key: routeKey, route: null, error: '' })
                setRetryCount((count) => count + 1)
              }}>Try again</button>
            </div>
          )}
          {!isLoading && !routeError && routeLegs.map((leg, index) => (
            <article className="trip-route-leg" key={`${leg.type}-${index}-${leg.from.name}-${leg.to.name}`}>
              <span>{leg.type === 'flight' ? '✈' : index + 1}</span>
              <div>
                <strong>{leg.from.name} <small>to</small> {leg.to.name}</strong>
                {leg.type === 'flight'
                  ? <p>Straight-line flight path</p>
                  : <p>{formatTravelTime(leg.duration)} · {formatDistance(leg.distance)} by road</p>}
              </div>
            </article>
          ))}
          {plan.edges.length === 0 && <p>Add located activities to this day to see routes.</p>}
          {plan.hasUnlocatedItems && (
            <p>Some activities need a selected map location before a complete route can be shown.</p>
          )}
          {routeSegments.length === 0 && plan.edges.length > 0 && !isLoading && !routeError && (
            <p>Pin the activity locations to calculate driving routes.</p>
          )}
        </div>
      </div>
      <p className="trip-route-attribution">
        Place search uses Photon and OpenStreetMap data. Driving estimates use the public OSRM demo router and may not reflect traffic, closures, or current road conditions.
      </p>
    </section>
  )
}

export default TripRouteMap
