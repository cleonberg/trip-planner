import { collection, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from './firebase.js'

function getCollections(userId) {
  return {
    trips: collection(db, 'users', userId, 'trips'),
    annualPlans: collection(db, 'users', userId, 'annualPlans'),
    wishlistItems: collection(db, 'users', userId, 'wishlistItems'),
    days: collection(db, 'users', userId, 'trips', 'yosemite', 'days'),
  }
}

function toItems(snapshot) {
  return snapshot.docs.map((document) => ({ ...document.data(), id: document.id }))
}

async function ensureOwnerMembership(userId, tripId) {
  const membership = doc(db, 'users', userId, 'trips', tripId, 'members', userId)
  const snapshot = await getDoc(membership)
  if (snapshot.exists()) {
    if (snapshot.data().role !== 'owner') {
      throw new Error(`The signed-in user is not the owner of trip ${tripId}.`)
    }
    return
  }
  await setDoc(membership, { userId, role: 'owner' })
}

export async function loadPlannerData(userId) {
  const collections = getCollections(userId)
  const [trips, annualPlans, wishlistItems, days] = await Promise.all(
    Object.values(collections).map((reference) => getDocs(reference)),
  )
  const loadedTrips = toItems(trips)
  await Promise.all(loadedTrips.map((trip) => ensureOwnerMembership(userId, trip.id)))

  return {
    trips: loadedTrips,
    annualPlans: toItems(annualPlans),
    wishlistItems: toItems(wishlistItems),
    days: toItems(days),
  }
}

export async function loadSharedTrips(userId) {
  const memberships = await getDocs(collection(db, 'users', userId, 'sharedTrips'))
  return toItems(memberships)
}

export async function loadFamilyMembers(userId) {
  const members = await getDocs(collection(db, 'users', userId, 'familyMembers'))
  return toItems(members)
}

export async function createFamilyMember(userId, { name, email }) {
  const reference = doc(collection(db, 'users', userId, 'familyMembers'))
  const normalizedEmail = email.trim().toLowerCase()
  await setDoc(reference, {
    name: name.trim(),
    email: normalizedEmail,
    access: {},
    pendingAccess: {},
  })
  return { id: reference.id, name: name.trim(), email: normalizedEmail, access: {}, pendingAccess: {} }
}

export async function loadSharedTrip(ownerUid, tripId) {
  const tripReference = doc(db, 'users', ownerUid, 'trips', tripId)
  const [trip, days] = await Promise.all([
    getDoc(tripReference),
    getDocs(collection(tripReference, 'days')),
  ])
  if (!trip.exists()) throw new Error('This shared trip no longer exists.')
  return {
    trip: { ...trip.data(), id: trip.id },
    days: toItems(days),
  }
}

export async function saveSharedTrip(ownerUid, tripId, trip) {
  const data = Object.fromEntries(
    Object.entries(trip).filter(([key]) => !['id', 'sharedRole', 'locked'].includes(key)),
  )
  await updateDoc(
    doc(db, 'users', ownerUid, 'trips', tripId),
    removeUndefined(data),
  )
}

export async function loadTripMembers(ownerUid, tripId) {
  const members = await getDocs(collection(db, 'users', ownerUid, 'trips', tripId, 'members'))
  return toItems(members)
}

export async function loadTripInvites(ownerUid, tripId) {
  const invites = await getDocs(collection(db, 'users', ownerUid, 'trips', tripId, 'invites'))
  return invites.docs.map((document) => {
    const invite = Object.fromEntries(
      Object.entries(document.data()).filter(([key]) => key !== 'tokenHash'),
    )
    return { ...invite, id: document.id }
  })
}

function removeUndefined(value) {
  if (Array.isArray(value)) {
    return value.map((item) => item === undefined ? null : removeUndefined(item))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, removeUndefined(item)]),
    )
  }
  return value
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function getDocumentId(collectionName, item) {
  const id = collectionName === 'annualPlans' ? item.year : item.id
  if (id === undefined || id === null || String(id).includes('/')) {
    throw new Error(`Invalid document ID in ${collectionName}.`)
  }
  return String(id)
}

async function syncCollection(reference, collectionName, previousItems, nextItems) {
  const previous = new Map()
  const next = new Map()
  const operations = []

  previousItems.forEach((item) => {
    const id = getDocumentId(collectionName, item)
    if (previous.has(id)) throw new Error(`Duplicate document ID in ${collectionName}: ${id}`)
    previous.set(id, removeUndefined(item))
  })

  nextItems.forEach((item) => {
    const id = getDocumentId(collectionName, item)
    if (next.has(id)) throw new Error(`Duplicate document ID in ${collectionName}: ${id}`)
    const data = removeUndefined(item)
    next.set(id, data)
    if (!previous.has(id) || stableStringify(previous.get(id)) !== stableStringify(data)) {
      operations.push({ type: 'set', reference: doc(reference, id), data })
    }
  })

  previous.forEach((_, id) => {
    if (!next.has(id)) operations.push({ type: 'delete', reference: doc(reference, id) })
  })

  for (let index = 0; index < operations.length; index += 450) {
    const batch = writeBatch(db)
    operations.slice(index, index + 450).forEach((operation) => {
      if (operation.type === 'set') batch.set(operation.reference, operation.data)
      else batch.delete(operation.reference)
    })
    await batch.commit()
  }
}

export async function savePlannerData(userId, previousData, nextData) {
  const collections = getCollections(userId)
  await Promise.all(
    Object.entries(collections).map(([name, reference]) => (
      syncCollection(reference, name, previousData[name], nextData[name])
    )),
  )
  const previousTripIds = new Set(previousData.trips.map((trip) => trip.id))
  await Promise.all(
    nextData.trips
      .filter((trip) => !previousTripIds.has(trip.id))
      .map((trip) => ensureOwnerMembership(userId, trip.id)),
  )
}
