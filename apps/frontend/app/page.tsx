import { ConnectGate } from "@/components/ConnectGate";
import { EndorseCard } from "@/components/EndorseCard";
import { FounderPassportCard } from "@/components/FounderPassportCard";
import { RegisterIdentityCard } from "@/components/RegisterIdentityCard";

export default function HomePage() {
  return (
    <main>
      <ConnectGate>
        <RegisterIdentityCard />
        <EndorseCard />
        <FounderPassportCard />
      </ConnectGate>
    </main>
  );
}
