import { useAuth } from "../contexts/AuthProvider";

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-required">
        <h2>Authentication Required</h2>
        <p>Please log in to access this page.</p>
      </div>
    );
  }

  return children;
};

export default ProtectedRoute;
