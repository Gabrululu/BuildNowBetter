import { ConnectGate } from "@/components/ConnectGate";
import { RegisterIdentityCard } from "@/components/RegisterIdentityCard";

export default function HomePage() {
  return (
    <main>
      <ConnectGate>
        <RegisterIdentityCard />
      </ConnectGate>
    </main>
  );
}
