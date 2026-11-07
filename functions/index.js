const { randomBytes, randomUUID, createHash, timingSafeEqual } = require('node:crypto')
const { initializeApp } = require('firebase-admin/app')
const { FieldValue, Timestamp, getFirestore } = require('firebase-admin/firestore')
const { HttpsError, onCall } = require('firebase-functions/https')
const { setGlobalOptions } = require('firebase-functions')

setGlobalOptions({ region: 'us-central1', maxInstances: 5 })
initializeApp()

const db = getFirestore()
const inviteLifetimeMs = 7 * 24 * 60 * 60 * 1000

function requireAuthenticatedUser(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in before managing trip access.')
  }
  return request.auth
}

function requireDocumentId(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('/')) {
    throw new HttpsError('invalid-argument', `A valid ${label} is required.`)
  }
  return value
}

function getInviteRef(ownerUid, tripId, inviteId) {
  return db.doc(`users/${ownerUid}/trips/${tripId}/invites/${inviteId}`)
}

function getMemberRef(ownerUid, tripId, memberUid) {
  return db.doc(`users/${ownerUid}/trips/${tripId}/members/${memberUid}`)
}

function getSharedTripRef(memberUid, ownerUid, tripId) {
  const membershipId = createHash('sha256')
    .update(`${ownerUid}\0${tripId}`)
    .digest('hex')
  return db.doc(`users/${memberUid}/sharedTrips/${membershipId}`)
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function tokenMatches(token, expectedHash) {
  if (typeof token !== 'string' || typeof expectedHash !== 'string') return false
  const actual = Buffer.from(hashToken(token), 'hex')
  const expected = Buffer.from(expectedHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function requireOwner(request, ownerUid) {
  const auth = requireAuthenticatedUser(request)
  if (auth.uid !== ownerUid) {
    throw new HttpsError('permission-denied', 'Only the trip owner can manage access.')
  }
  return auth
}

exports.createTripInvite = onCall(async (request) => {
  const auth = requireAuthenticatedUser(request)
  const tripId = requireDocumentId(request.data?.tripId, 'trip ID')
  const email = typeof request.data?.email === 'string'
    ? request.data.email.trim().toLowerCase()
    : ''
  const role = request.data?.role

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new HttpsError('invalid-argument', 'Enter a valid email address.')
  }
  if (role !== 'viewer' && role !== 'editor') {
    throw new HttpsError('invalid-argument', 'Choose viewer or editor access.')
  }
  if (auth.token.email && auth.token.email.toLowerCase() === email) {
    throw new HttpsError('failed-precondition', 'You already own this trip.')
  }

  const tripRef = db.doc(`users/${auth.uid}/trips/${tripId}`)
  const tripSnapshot = await tripRef.get()
  if (!tripSnapshot.exists) {
    throw new HttpsError('not-found', 'That trip could not be found.')
  }

  const inviteId = randomUUID()
  const token = randomBytes(32).toString('base64url')
  const expiresAt = Timestamp.fromMillis(Date.now() + inviteLifetimeMs)
  await getInviteRef(auth.uid, tripId, inviteId).create({
    email,
    role,
    status: 'pending',
    tokenHash: hashToken(token),
    createdBy: auth.uid,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
  })

  return { inviteId, token, expiresAt: expiresAt.toMillis() }
})

exports.acceptTripInvite = onCall(async (request) => {
  const auth = requireAuthenticatedUser(request)
  const email = typeof auth.token.email === 'string' ? auth.token.email.toLowerCase() : ''
  if (!email || auth.token.email_verified !== true) {
    throw new HttpsError('failed-precondition', 'Sign in with a verified Google email to accept this invite.')
  }

  const ownerUid = requireDocumentId(request.data?.ownerUid, 'owner ID')
  const tripId = requireDocumentId(request.data?.tripId, 'trip ID')
  const inviteId = requireDocumentId(request.data?.inviteId, 'invite ID')
  const token = request.data?.token
  if (typeof token !== 'string' || token.length < 32 || token.length > 128) {
    throw new HttpsError('invalid-argument', 'This invite link is invalid.')
  }

  const inviteRef = getInviteRef(ownerUid, tripId, inviteId)
  const tripRef = db.doc(`users/${ownerUid}/trips/${tripId}`)
  const memberRef = getMemberRef(ownerUid, tripId, auth.uid)
  const sharedTripRef = getSharedTripRef(auth.uid, ownerUid, tripId)

  await db.runTransaction(async (transaction) => {
    const [inviteSnapshot, tripSnapshot] = await Promise.all([
      transaction.get(inviteRef),
      transaction.get(tripRef),
    ])
    if (!inviteSnapshot.exists || !tripSnapshot.exists) {
      throw new HttpsError('not-found', 'This invite or trip no longer exists.')
    }

    const invite = inviteSnapshot.data()
    if (!tokenMatches(token, invite.tokenHash)) {
      throw new HttpsError('permission-denied', 'This invite link is invalid.')
    }
    if (invite.email !== email) {
      throw new HttpsError('permission-denied', `This invite was sent to ${invite.email}. Sign in with that Google account.`)
    }
    if (invite.status === 'accepted' && invite.acceptedBy === auth.uid) return
    if (invite.status !== 'pending') {
      throw new HttpsError('failed-precondition', 'This invite has already been used or revoked.')
    }
    if (!(invite.expiresAt instanceof Timestamp) || invite.expiresAt.toMillis() <= Date.now()) {
      throw new HttpsError('deadline-exceeded', 'This invite has expired. Ask the owner for a new one.')
    }

    const member = {
      userId: auth.uid,
      email,
      role: invite.role,
      invitedBy: ownerUid,
      addedAt: FieldValue.serverTimestamp(),
    }
    transaction.set(memberRef, member)
    transaction.set(sharedTripRef, {
      ownerUid,
      tripId,
      tripName: tripSnapshot.data().name ?? 'Shared trip',
      role: invite.role,
      inviteId,
      joinedAt: FieldValue.serverTimestamp(),
    })
    transaction.update(inviteRef, {
      status: 'accepted',
      acceptedBy: auth.uid,
      acceptedAt: FieldValue.serverTimestamp(),
    })
  })

  return { ownerUid, tripId }
})

exports.revokeTripInvite = onCall(async (request) => {
  const auth = requireAuthenticatedUser(request)
  const tripId = requireDocumentId(request.data?.tripId, 'trip ID')
  const inviteId = requireDocumentId(request.data?.inviteId, 'invite ID')
  const inviteRef = getInviteRef(auth.uid, tripId, inviteId)

  const inviteSnapshot = await inviteRef.get()
  if (!inviteSnapshot.exists) {
    throw new HttpsError('not-found', 'That invite could not be found.')
  }
  if (inviteSnapshot.data().status !== 'pending') {
    throw new HttpsError('failed-precondition', 'Only a pending invite can be revoked.')
  }
  requireOwner(request, auth.uid)
  await inviteRef.update({ status: 'revoked', revokedAt: FieldValue.serverTimestamp() })
  return { inviteId }
})

exports.revokeTripMember = onCall(async (request) => {
  const auth = requireAuthenticatedUser(request)
  const tripId = requireDocumentId(request.data?.tripId, 'trip ID')
  const memberUid = requireDocumentId(request.data?.memberUid, 'member ID')
  requireOwner(request, auth.uid)

  if (memberUid === auth.uid) {
    throw new HttpsError('failed-precondition', 'The owner cannot remove themselves from the trip.')
  }

  const memberRef = getMemberRef(auth.uid, tripId, memberUid)
  const memberSnapshot = await memberRef.get()
  if (!memberSnapshot.exists) {
    throw new HttpsError('not-found', 'That trip member could not be found.')
  }
  await db.batch()
    .delete(memberRef)
    .delete(getSharedTripRef(memberUid, auth.uid, tripId))
    .commit()

  return { memberUid }
})
