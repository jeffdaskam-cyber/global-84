import { NavLink } from "react-router-dom";

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t shadow">
      <div className="max-w-md mx-auto grid grid-cols-5 text-center text-xs font-semibold">
        <NavLink to="/" className="py-4">Home</NavLink>
        <NavLink to="/explore" className="py-4">Explore</NavLink>
        <NavLink to="/events" className="py-4">Events</NavLink>
        <NavLink to="/chat" className="py-4">Chat</NavLink>
        <NavLink to="/me" className="py-4">Me</NavLink>
      </div>
    </nav>
  );
}