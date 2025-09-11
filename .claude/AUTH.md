# Authentication System Documentation

## Current Implementation: Clerk Authentication

This project uses **Clerk** (https://clerk.com) for authentication, providing a complete authentication solution for both frontend and backend.

### Why Clerk?

- **Production-ready security**: SOC 2 compliant, handles all security best practices
- **Built-in features**: MFA, social logins, magic links, passwordless authentication
- **User management UI**: Pre-built components for sign-in/up, user profiles
- **Webhooks & APIs**: Easy integration with backend services
- **Session management**: Automatic token refresh, secure cookies
- **Faster development**: Authentication working in hours, not weeks

### Frontend Setup (React + Vite)

1. **Package**: `@clerk/clerk-react@latest`
2. **Configuration**: Wrapped in `<ClerkProvider>` in `main.tsx`
3. **Environment Variable**: `VITE_CLERK_PUBLISHABLE_KEY` in `.env.local`

#### Key Frontend Files:
- `src/main.tsx` - ClerkProvider setup with publishable key
- `src/App.tsx` - Main routing with Clerk components
- `src/components/ApiProvider.tsx` - Provides Clerk token to API service
- `src/hooks/useClerkToken.tsx` - Hook to manage Clerk token for API requests
- `src/services/api.ts` - API service with Clerk token integration

### Backend Setup (Express)

1. **Package**: `@clerk/express`
2. **Middleware**: Clerk authentication middleware for protected routes
3. **Environment Variables**: 
   - `CLERK_SECRET_KEY` - Server-side secret key
   - `CLERK_PUBLISHABLE_KEY` - Public key for frontend reference

#### Key Backend Files:
- `src/middleware/clerk.middleware.ts` - Clerk authentication middleware
- `src/routes/` - All routes now use Clerk for authentication

### Available Clerk Components

- `<SignInButton>` - Sign in button
- `<SignUpButton>` - Sign up button
- `<UserButton>` - User profile dropdown
- `<SignedIn>` - Content visible only when signed in
- `<SignedOut>` - Content visible only when signed out
- `<RedirectToSignIn>` - Redirect to sign in page
- `<RedirectToSignUp>` - Redirect to sign up page

### Clerk Dashboard Configuration

Access your Clerk Dashboard at: https://dashboard.clerk.com

Key settings:
- **Application Name**: Amazon Monitor
- **Sign-in methods**: Email/password, Google OAuth
- **Session duration**: 7 days
- **Multi-factor auth**: Optional for users

### Migration Notes

**Previous System (Removed)**:
- Custom JWT implementation (`authenticateToken` middleware)
- Manual session management with bcrypt password hashing
- No MFA support
- Security vulnerabilities in token handling

**Migration Completed**: August 29, 2025
**Migration Status**: ✅ Complete
- All routes migrated from `authenticateToken` to `clerkAuth`
- Frontend integrated with `@clerk/clerk-react`
- Backend using `@clerk/express` middleware
- API calls include Clerk token in Authorization header

### Development Workflow

1. User signs up/in through Clerk UI components
2. Clerk handles all authentication flows
3. Backend validates requests using Clerk middleware
4. User session managed automatically by Clerk

### Testing

- Test accounts can be created directly in Clerk Dashboard
- Use Clerk's test mode for development
- Production keys should be stored securely and never committed

### Security Notes

- Never commit actual Clerk keys to version control
- Use environment variables for all sensitive configuration
- Clerk handles all security best practices automatically
- Regular security updates provided by Clerk

### Implementation Details

#### Frontend Token Management
```typescript
// src/hooks/useClerkToken.tsx
const { getToken } = useAuth();
const token = await getToken();
// Token is automatically included in API requests
```

#### Backend Middleware
```typescript
// src/middleware/clerk.middleware.ts
import { requireAuth } from '@clerk/express';
export const clerkAuth = requireAuth();
```

#### Protected Routes
All API routes now use `clerkAuth` middleware:
- `/api/dashboard/*`
- `/api/sales/*`
- `/api/products/*`
- `/api/orders/*`

### Troubleshooting

Common issues:
1. **Missing publishable key**: Check `.env.local` has `VITE_CLERK_PUBLISHABLE_KEY`
2. **Backend auth fails**: Verify `CLERK_SECRET_KEY` in backend `.env`
3. **CORS issues**: Ensure frontend URL is in Clerk's allowed origins
4. **Session expires**: Clerk handles refresh automatically
5. **401 Unauthorized**: Ensure Clerk token is being sent in API requests

### Support

- Clerk Documentation: https://clerk.com/docs
- Clerk Support: https://clerk.com/support
- Project-specific issues: Check this repository's issues