import { ROLES } from '@gym/shared';

export default function Home() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Gym Inventory</h1>
      <p>Shared contract wired — roles: {ROLES.join(', ')}</p>
    </main>
  );
}
