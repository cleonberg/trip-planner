import { readFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore'

const projectId = 'demo-trip-planner'
let testEnvironment

before(async () => {
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')
  testEnvironment = await initializeTestEnvironment({ projectId, firestore: { rules } })

  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore()
    await Promise.all([
      setDoc(doc(firestore, 'users', 'owner-uid', 'trips', 'trip-1'), {
        id: 'trip-1',
        name: 'Test trip',
      }),
      setDoc(doc(firestore, 'users', 'owner-uid', 'trips', 'locked-trip'), {
        id: 'locked-trip',
        name: 'Locked trip',
        locked: true,
      }),
      setDoc(doc(firestore, 'users', 'owner-uid', 'trips', 'trip-1', 'days', 'day-1'), {
        activities: [],
      }),
      setDoc(doc(firestore, 'users', 'owner-uid', 'trips', 'locked-trip', 'days', 'day-1'), {
        activities: [],
      }),
      setDoc(doc(firestore, 'users', 'owner-uid', 'trips', 'trip-1', 'members', 'owner-uid'), {
        userId: 'owner-uid',
        role: 'owner',
      }),
      setDoc(doc(firestore, 'users', 'owner-uid', 'trips', 'trip-1', 'members', 'viewer-uid'), {
        userId: 'viewer-uid',
        role: 'viewer',
      }),
      setDoc(doc(firestore, 'users', 'owner-uid', 'trips', 'trip-1', 'members', 'editor-uid'), {
        userId: 'editor-uid',
        role: 'editor',
      }),
      setDoc(doc(firestore, 'users', 'owner-uid', 'trips', 'locked-trip', 'members', 'editor-uid'), {
        userId: 'editor-uid',
        role: 'editor',
      }),
      setDoc(doc(firestore, 'users', 'owner-uid', 'trips', 'trip-1', 'invites', 'invite-1'), {
        email: 'invitee@example.com',
        status: 'pending',
      }),
      setDoc(doc(firestore, 'users', 'viewer-uid', 'sharedTrips', 'trip-ref'), {
        ownerUid: 'owner-uid',
        tripId: 'trip-1',
      }),
      setDoc(doc(firestore, 'users', 'owner-uid', 'campaigns', 'campaign-1'), { name: 'Private campaign' }),
      setDoc(doc(firestore, 'users', 'owner-uid', 'familyMembers', 'family-1'), {
        name: 'Family member',
        email: 'family@example.com',
        access: {},
      }),
    ])
  })
})

after(async () => {
  await testEnvironment?.cleanup()
})

function firestoreFor(uid) {
  return testEnvironment.authenticatedContext(uid).firestore()
}

function tripDocument(firestore) {
  return doc(firestore, 'users', 'owner-uid', 'trips', 'trip-1')
}

function dayDocument(firestore) {
  return doc(firestore, 'users', 'owner-uid', 'trips', 'trip-1', 'days', 'day-1')
}

test('owners retain access to their trips and trip members', async () => {
  const firestore = firestoreFor('owner-uid')
  await assertSucceeds(getDoc(tripDocument(firestore)))
  await assertSucceeds(updateDoc(tripDocument(firestore), { name: 'Updated trip' }))
  await assertSucceeds(getDocs(collection(firestore, 'users', 'owner-uid', 'trips', 'trip-1', 'members')))
  await assertSucceeds(getDoc(doc(firestore, 'users', 'owner-uid', 'trips', 'trip-1', 'invites', 'invite-1')))
})

test('viewers can read trip data but cannot change it', async () => {
  const firestore = firestoreFor('viewer-uid')
  await assertSucceeds(getDoc(tripDocument(firestore)))
  await assertSucceeds(getDoc(dayDocument(firestore)))
  await assertFails(updateDoc(tripDocument(firestore), { name: 'Not allowed' }))
  await assertFails(updateDoc(dayDocument(firestore), { activities: ['not allowed'] }))
  await assertFails(getDoc(doc(firestore, 'users', 'owner-uid', 'trips', 'trip-1', 'invites', 'invite-1')))
})

test('editors can change trip content but cannot delete the trip or manage membership', async () => {
  const firestore = firestoreFor('editor-uid')
  await assertSucceeds(updateDoc(tripDocument(firestore), { name: 'Editor update' }))
  await assertSucceeds(updateDoc(dayDocument(firestore), { activities: ['editor activity'] }))
  await assertFails(deleteDoc(tripDocument(firestore)))
  await assertFails(setDoc(doc(firestore, 'users', 'owner-uid', 'trips', 'trip-1', 'members', 'new-uid'), {
    userId: 'new-uid',
    role: 'editor',
  }))
})

test('locking a trip leaves it readable but prevents contributors from changing trip content', async () => {
  const editorFirestore = firestoreFor('editor-uid')
  const lockedTrip = doc(editorFirestore, 'users', 'owner-uid', 'trips', 'locked-trip')
  const lockedDay = doc(editorFirestore, 'users', 'owner-uid', 'trips', 'locked-trip', 'days', 'day-1')
  await assertSucceeds(getDoc(lockedTrip))
  await assertSucceeds(getDoc(lockedDay))
  await assertFails(updateDoc(lockedTrip, { name: 'Accidental change' }))
  await assertFails(updateDoc(lockedTrip, { locked: false }))
  await assertFails(updateDoc(lockedDay, { activities: ['Accidental change'] }))
  await assertSucceeds(updateDoc(doc(firestoreFor('owner-uid'), 'users', 'owner-uid', 'trips', 'locked-trip'), {
    locked: false,
  }))
})

test('uninvited users cannot access a trip', async () => {
  const firestore = firestoreFor('outsider-uid')
  await assertFails(getDoc(tripDocument(firestore)))
  await assertFails(getDoc(dayDocument(firestore)))
})

test('shared-trip indexes are private and read-only to their recipient', async () => {
  const recipientFirestore = firestoreFor('viewer-uid')
  await assertSucceeds(getDoc(doc(recipientFirestore, 'users', 'viewer-uid', 'sharedTrips', 'trip-ref')))
  await assertFails(setDoc(doc(recipientFirestore, 'users', 'viewer-uid', 'sharedTrips', 'forged-ref'), {
    ownerUid: 'owner-uid',
    tripId: 'another-trip',
  }))
  await assertFails(getDoc(doc(firestoreFor('outsider-uid'), 'users', 'viewer-uid', 'sharedTrips', 'trip-ref')))
})

test('family contacts and the other app collections remain private to their owner', async () => {
  await assertSucceeds(getDoc(doc(firestoreFor('owner-uid'), 'users', 'owner-uid', 'campaigns', 'campaign-1')))
  await assertFails(getDoc(doc(firestoreFor('viewer-uid'), 'users', 'owner-uid', 'campaigns', 'campaign-1')))
  await assertSucceeds(getDoc(doc(firestoreFor('owner-uid'), 'users', 'owner-uid', 'familyMembers', 'family-1')))
  await assertFails(getDoc(doc(firestoreFor('viewer-uid'), 'users', 'owner-uid', 'familyMembers', 'family-1')))
})
