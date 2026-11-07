# Wayfare trip planner

A React and Vite prototype for organizing lifetime travel plans. The lifetime overview groups trips by year, compares estimated costs and vacation days against editable annual limits, maps trip and wish-list locations, and lets you move trips between years. The wish list stores experiences with a place, season, priority, time and cost estimate, and lets you assign them to trips. Yosemite is the current detailed itinerary example, with day-by-day scheduling, activity editing, place search, maps, and estimated driving routes.

The Yosemite trip includes a whole-trip overview with all itinerary stops on one map, daily summaries, and a multi-day calendar. Drag activities across days or times and resize them; edits are reflected in the corresponding daily itinerary. Per-day driving routes remain in the day-by-day view.

Other trip details also include a draggable calendar and an agenda view for scheduled wish-list experiences. Trips without exact dates use relative day labels until dates are set. Open any trip and choose **Edit trip details** to change its name, destination, planned year, dates, length, vacation days, and estimated cost. An optional exact start date sets the calendar dates; flexible trips can leave it blank. A trip cannot be shortened past days that already contain scheduled itinerary items.

## Run locally

```powershell
npm install
npm run dev
```

Sign in with Google to use the planner. Firebase Authentication and Cloud Firestore must be enabled for the Firebase project configured in `src/firebase.js`. Deploy Firestore rules and invitation functions to that project with `npx firebase-tools login` followed by `npx firebase-tools deploy --only firestore:rules,functions --project option-dashboard-data`. Cloud Functions deployment requires the Firebase project to use the Blaze billing plan. The rules preserve the other app collections and allow shared-trip access by role. The app saves trips, annual plans, wish-list items, and Yosemite itinerary days to Firestore; first-time accounts start with an empty planner. Each trip has a `members/{uid}` record that identifies its owner and accepted collaborators. Changes are saved automatically, and the header reports save errors with a retry option.

On the lifetime overview, edit annual travel budgets and vacation-day limits, use the year selector or drag-and-drop to move a trip, and add past trips or future plans. A wish-list item can be unassigned, assigned to a trip, scheduled as a day-and-time itinerary block, or marked visited. Schedule an assigned item from either its trip details or the wish list; it appears on the Yosemite calendar or the selected trip's day-by-day itinerary. Editing, moving, or removing a linked Yosemite block keeps the wish-list status and schedule in sync. The wish list supports status filters and trip assignment. Newly added destinations can be searched with Photon; place searches are explicit (not autocomplete), cached for the current browser session, and spaced at least one second apart. Search terms are sent to the public Photon geocoder.

Open a trip and use **Add from wish list** in **Assigned ideas to schedule** to attach an unassigned idea directly to that trip. To move an idea assigned to a different trip, change its trip selector on the wish-list screen.

Yosemite activities appear on a day calendar with estimated sample durations; new blocks default to one hour. Click a block to edit its details or location, drag it to change its start time, drag its edge to resize it, or select an open time range to create a block. Activity locations can be searched or pinned manually. Route estimates use the public OSRM demo service and send selected stop coordinates to that service; they are driving-only estimates without live traffic. Photon and the OSRM demo service have no availability guarantee and are not suitable as production backends. Before publishing for regular use, replace them with hosted services or self-hosted instances.

Open a trip and choose **Manage access** to save people's names and email addresses, then set each person's access to none, viewer, or contributor for that trip. The **People & access** page lets you select multiple people and trips and apply the same role to all selected combinations at once. People sign in with the same verified Google email to see trips tagged for them; if they have not signed in yet, access activates the next time they open the app after signing in. The app does not send email. Owners can remove people and can lock a trip to prevent contributors from changing it; owners can still make changes while it is locked. Existing one-time invitations remain valid, and owners can revoke pending invitations or remove other collaborators. Viewers can read trip details and activities; contributors can update them unless the owner has locked the trip. Personal annual plans and wish-list items are not shared.

Shared trip data is loaded when opened, not live-synchronized. Refresh or reopen a trip to see another person's changes. Avoid editing the same trip at the same time; simultaneous edits to the same trip document can overwrite one another.

## Next steps

1. Add detailed day-by-day itineraries to trips beyond the Yosemite example.
2. Choose production geocoding and routing services, including desired travel modes.
3. Configure GitHub Pages deployment for this separate site.
4. Add live updates and conflict-safe writes for shared trips.
