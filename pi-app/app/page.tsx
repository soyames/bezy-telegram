import { BezyApp } from "@/components/bezy-app";

export default function Page() {
  // app/layout.tsx already wraps every route in AppWrapper. Wrapping again here mounted
  // PiAuthProvider twice, nested, so initialize() ran two Pi logins and two parent-credential
  // probes per load, racing each other.
  return <BezyApp />;
}
