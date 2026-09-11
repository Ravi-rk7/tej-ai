import AuthProvider from './AuthProvider';

// Only live/account route layouts import this module. Public routes never do.
export default function LiveProviders({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}
