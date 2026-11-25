import SessionGate from "@/components/auth/SessionProvider";

// The live workspace is protected by SessionGate. Data is only requested after the backend confirms
// the session, and the API enforces the organisation boundary on every call.
export default function ProtectedLayout({ children }) {
  return <SessionGate>{children}</SessionGate>;
}
