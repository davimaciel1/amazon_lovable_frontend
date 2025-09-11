import { useAuth } from '@clerk/clerk-react';
import { useEffect } from 'react';
import { api } from '@/services/api';

export function useClerkToken() {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (isLoaded) {
      // Set up the token getter for the API service
      api.setTokenGetter(async () => {
        if (isSignedIn) {
          try {
            const token = await getToken();
            return token;
          } catch (error) {
            console.error('Failed to get Clerk token:', error);
            return null;
          }
        }
        return null;
      });
    }
  }, [getToken, isLoaded, isSignedIn]);

  return { isLoaded, isSignedIn };
}