import { useCallback, useEffect, useState } from 'react'
import { loadTripInvites, loadTripMembers } from './plannerStore.js'
import { createTripInvite, revokeTripInvite, revokeTripMember } from './tripInvites.js'

function makeInviteUrl(userId, tripId, invite) {
  const url = new URL(`${window.location.origin}${window.location.pathname}`)
  url.searchParams.set('inviteOwner', userId)
  url.searchParams.set('inviteTrip', tripId)
  url.searchParams.set('inviteId', invite.inviteId)
  url.searchParams.set('inviteToken', invite.token)
  return url.toString()
}

function getExpiryLabel(timestamp) {
  if (!timestamp?.toDate) return ''
  return `Expires ${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(timestamp.toDate())}`
}

function TripShareDialog({ user, trip, onClose }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('viewer')
  const [inviteUrl, setInviteUrl] = useState('')
  const [members, setMembers] = useState([])
  const [invites, setInvites] = useState([])
  const [isLoadingAccess, setIsLoadingAccess] = useState(true)
  const [isCreatingInvite, setIsCreatingInvite] = useState(false)
  const [workingId, setWorkingId] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const refreshAccess = useCallback(async () => {
    setIsLoadingAccess(true)
    setError('')
    try {
      const [nextMembers, nextInvites] = await Promise.all([
        loadTripMembers(user.uid, trip.id),
        loadTripInvites(user.uid, trip.id),
      ])
      setMembers(nextMembers)
      setInvites(nextInvites)
    } catch (loadError) {
      console.error('Unable to load trip access details.', loadError)
      setError(loadError.message)
    } finally {
      setIsLoadingAccess(false)
    }
  }, [trip.id, user.uid])

  useEffect(() => {
    let active = true
    Promise.resolve().then(() => {
      if (active) return refreshAccess()
      return undefined
    })
    return () => {
      active = false
    }
  }, [refreshAccess])

  async function handleCreateInvite(event) {
    event.preventDefault()
    setIsCreatingInvite(true)
    setError('')
    setInviteUrl('')
    setCopied(false)
    try {
      const invite = await createTripInvite({ tripId: trip.id, email, role })
      setInviteUrl(makeInviteUrl(user.uid, trip.id, invite))
      setEmail('')
      await refreshAccess()
    } catch (createError) {
      console.error('Unable to create trip invite.', createError)
      setError(createError.message)
    } finally {
      setIsCreatingInvite(false)
    }
  }

  async function handleCopyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setError('')
    } catch (copyError) {
      console.error('Unable to copy trip invite link.', copyError)
      setError('Could not copy the link. Select and copy it manually.')
    }
  }

  async function handleRevokeInvite(inviteId) {
    setWorkingId(inviteId)
    setError('')
    try {
      await revokeTripInvite({ tripId: trip.id, inviteId })
      await refreshAccess()
    } catch (revokeError) {
      console.error('Unable to revoke trip invite.', revokeError)
      setError(revokeError.message)
    } finally {
      setWorkingId('')
    }
  }

  async function handleRemoveMember(memberUid) {
    setWorkingId(memberUid)
    setError('')
    try {
      await revokeTripMember({ tripId: trip.id, memberUid })
      await refreshAccess()
    } catch (revokeError) {
      console.error('Unable to remove trip member.', revokeError)
      setError(revokeError.message)
    } finally {
      setWorkingId('')
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <button className="close-form dialog-close" type="button" aria-label="Close" onClick={onClose}>×</button>
        <div className="share-dialog-icon">↗</div>
        <h2 id="share-title">Share {trip.name}</h2>
        <p>Invite someone by email. They must sign in with that verified Google account. Links expire after 7 days and can be used once. Create links from the deployed site; localhost links will not work for them.</p>
        <form className="trip-invite-form" onSubmit={handleCreateInvite}>
          <label className="form-field">
            <span>Email address</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="traveler@example.com"
            />
          </label>
          <label className="form-field">
            <span>Access</span>
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="viewer">Viewer · can view the trip</option>
              <option value="editor">Editor · can change trip details and activities</option>
            </select>
          </label>
          <button className="primary-button" type="submit" disabled={isCreatingInvite}>
            {isCreatingInvite ? 'Creating invite…' : 'Create invite link'}
          </button>
        </form>
        {inviteUrl && (
          <div className="trip-invite-link">
            <label className="form-field">
              <span>Copy and send this one-time link</span>
              <input readOnly value={inviteUrl} onFocus={(event) => event.target.select()} />
            </label>
            <button className="secondary-button" type="button" onClick={handleCopyInvite}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        )}
        {error && <p className="trip-invite-error" role="alert">{error}</p>}
        <section className="trip-access-list" aria-label="Trip access">
          <h3>People with access</h3>
          {isLoadingAccess
            ? <p>Loading access…</p>
            : members.length > 0
              ? members.map((member) => (
                <div className="trip-access-row" key={member.userId}>
                  <span>{member.role === 'owner' ? 'You · Owner' : member.email || member.userId}</span>
                  <strong>{member.role}</strong>
                  {member.role !== 'owner' && (
                    <button
                      className="text-button"
                      type="button"
                      disabled={workingId === member.userId}
                      onClick={() => handleRemoveMember(member.userId)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))
              : <p>No members found.</p>}
        </section>
        {invites.some((invite) => invite.status === 'pending') && (
          <section className="trip-access-list" aria-label="Pending invites">
            <h3>Pending invites</h3>
            {invites.filter((invite) => invite.status === 'pending').map((invite) => (
              <div className="trip-access-row" key={invite.id}>
                <span>{invite.email} · {invite.role} · {getExpiryLabel(invite.expiresAt)}</span>
                <button
                  className="text-button"
                  type="button"
                  disabled={workingId === invite.id}
                  onClick={() => handleRevokeInvite(invite.id)}
                >
                  Revoke
                </button>
              </div>
            ))}
          </section>
        )}
        <button className="save-button dialog-done" type="button" onClick={onClose}>Done</button>
      </section>
    </div>
  )
}

export default TripShareDialog
