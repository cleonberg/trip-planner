const routeCache = new Map()
const legCache = new Map()

function isCoordinates(value) {
  return value
    && Number.isFinite(value.lat)
    && Number.isFinite(value.lng)
    && value.lat >= -90
    && value.lat <= 90
    && value.lng >= -180
    && value.lng <= 180
}

function getCoordinateKey(coordinates) {
  return coordinates.map(({ lat, lng }) => `${lng},${lat}`).join(';')
}

export async function getDrivingRoute(coordinates, signal) {
  if (coordinates.length < 2 || !coordinates.every(isCoordinates)) {
    throw new Error('A driving route requires at least two valid locations.')
  }

  const key = getCoordinateKey(coordinates)
  if (routeCache.has(key)) return routeCache.get(key)

  const response = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${key}?overview=full&geometries=geojson&steps=false`,
    { signal },
  )
  if (!response.ok) {
    throw new Error(`Routing service returned ${response.status}`)
  }

  const data = await response.json()
  const route = data.routes?.[0]
  if (data.code !== 'Ok' || !route || route.legs.length !== coordinates.length - 1) {
    throw new Error('Routing service could not find a complete driving route')
  }

  const result = {
    coordinates: route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]),
    legs: route.legs,
  }
  routeCache.set(key, result)
  route.legs.forEach((leg, index) => {
    legCache.set(getCoordinateKey(coordinates.slice(index, index + 2)), leg)
  })
  return result
}

export async function getDrivingLeg(from, to, signal) {
  const key = getCoordinateKey([from, to])
  if (legCache.has(key)) return legCache.get(key)
  const route = await getDrivingRoute([from, to], signal)
  return route.legs[0]
}
