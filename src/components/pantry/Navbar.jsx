import { Link, useLocation } from "react-router-dom";
import {
  SignInButton,
  SignUpButton,
  Show,
  UserButton,
} from "@clerk/react";

function Navbar() {
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <header className="navbar-container">
      <nav className="navbar">
        <Link to="/" className="nav-brand">
          <div className="brand-logo-icon">🥦</div>
          <div className="brand-text">
            <span className="brand-title">SmartPantry</span>
            <span className="brand-badge">AI 2.0</span>
          </div>
        </Link>

        <div className="nav-links">
          <Link to="/" className={`nav-item ${currentPath === "/" ? "active" : ""}`}>
            Home
          </Link>
          <Link to="/pantry" className={`nav-item ${currentPath === "/pantry" ? "active" : ""}`}>
            My Pantry
          </Link>
          <Link to="/add-product" className={`nav-item ${currentPath === "/add-product" ? "active" : ""}`}>
            Add Product
          </Link>
          <Link to="/demo" className={`nav-item demo-nav-link ${currentPath === "/demo" ? "active" : ""}`}>
            ✨ E2E Demo
          </Link>
        </div>

        <div className="auth-controls">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button type="button" className="auth-button auth-button-secondary">
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button type="button" className="auth-button auth-button-primary">
                Sign up
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <div className="user-button-wrapper">
              <UserButton />
            </div>
          </Show>
        </div>
      </nav>
    </header>
  );
}

export default Navbar;
