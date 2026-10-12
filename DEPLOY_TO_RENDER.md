# Deploy NFL Trade Lab to Render

## Cost
You can start on Render's Free compute plan.

## GitHub + Render deployment

1. Create a new GitHub repository named `nfl-trade-lab`.
2. Upload every file and folder from this project to the repository root.
3. Go to Render and sign in.
4. Click **New > Blueprint**.
5. Connect the GitHub repository.
6. Render will detect `render.yaml`.
7. Confirm the `nfl-trade-lab` web service and choose/apply the Free plan.
8. Wait for the deployment to finish.
9. Open the `.onrender.com` URL Render gives you.
10. Send that public URL to friends.

## What Render uses

- Runtime: Node
- Build: `npm install`
- Start: `npm start`
- Health check: `/api/health`
- Port: Render supplies `PORT`; the server listens on `0.0.0.0`

## Free-tier behavior

A free Render web service can spin down after a period without traffic.
The first visitor after a spin-down may wait while the app starts again.

## Updating the site

After deployment, push changes to the connected GitHub branch.
Render will rebuild and redeploy automatically.
