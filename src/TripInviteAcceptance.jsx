import { useEffect, useState } from 'react'
import { signOut } from 'firebase/auth'
import { acceptTripInvite } from './tripInvites.js'
import { auth } from './firebase.js'

const inviteParameterNames = ['inviteOwner', 'inviteTrip', 'inviteId', 'inviteToken']

function clearInviteFromUrl() {
  const url = new URL(window.location.href)
  inviteParameterNames.forEach((name) => url.searchParams.delete(name))
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}

function TripInviteAcceptance({ user, invite, onAccepted, onContinue }) {
  const [attempt, setAttempt] = useState(0)
  const [isAccepting, setIsAccepting] = useState(false)
  const [error, setError] = useState('')
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false)
  const isInvalidInvite = !invite.ownerUid || !invite.tripId || !invite.inviteId || !invite.token

  useEffect(() => {
    if (isInvalidInvite) return undefined

    let active = true
    Promise.resolve()
      .then(() => {
        if (active) setIsAccepting(true)
        return acceptTripInvite({
          ownerUid: invite.ownerUid,
          tripId: invite.tripId,
          inviteId: invite.inviteId,
          token: invite.token,
        })
      })
      .then(() => {
        if (!active) return
        clearInviteFromUrl()
        onAccepted()
      })
      .catch((acceptError) => {
        if (!active) return
        console.error('Unable to accept trip invite.', acceptError)
        setError(acceptError.message)
      })
      .finally(() => {
        if (active) setIsAccepting(false)
      })

    return () => {
      active = false
    }
  }, [attempt, invite.inviteId, invite.ownerUid, invite.token, invite.tripId, isInvalidInvite, onAccepted])

  const visibleError = isInvalidInvite ? 'This invitation link is incomplete or invalid.' : error

  async function handleSwitchAccount() {
    setIsSwitchingAccount(true)
    setError('')
    try {
      await signOut(auth)
    } catch (signOutError) {
      console.error('Unable to sign out before accepting the invite.', signOutError)
      setError(signOutError.message)
      setIsSwitchingAccount(false)
    }
  }

  function handleContinue() {
    clearInviteFromUrl()
    onContinue()
  }

  return (
    <main className="firebase-gate">
      <section className="firebase-gate-card">
        <div className="brand">
          <span className="brand-mark">w</span>
          <span>wayfare</span>
        </div>
        <h1>{isAccepting ? 'Joining shared trip' : visibleError ? 'Couldn’t accept invite' : 'Invite accepted'}</h1>
        <p>
          {isAccepting
            ? `Checking this invitation for ${user.email || 'your Google account'}…`
            : visibleError
              ? visibleError
              : 'You now have access to the shared trip.'}
        </p>
        {visibleError && (
          <div className="invite-actions">
            <button className="primary-button" type="button" disabled={isAccepting || isInvalidInvite} onClick={() => {
              setError('')
              setAttempt((value) => value + 1)
            }}>
              Try again
            </button>
            <button className="secondary-button" type="button" disabled={isSwitchingAccount} onClick={handleSwitchAccount}>
              {isSwitchingAccount ? 'Signing out…' : 'Switch Google account'}
            </button>
            <button className="text-button" type="button" onClick={handleContinue}>Open my planner instead</button>
          </div>
        )}
      </section>
    </main>
  )
}

export default TripInviteAcceptance
