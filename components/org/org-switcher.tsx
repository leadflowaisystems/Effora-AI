"use client";

import { useRouter } from "next/navigation";

interface Org {
  id: string;
  slug: string;
  name: string;
}

interface Props {
  orgs: Org[];
  currentSlug: string;
}

export function OrgSwitcher({ orgs, currentSlug }: Props) {
  const router = useRouter();
  const current = orgs.find((o) => o.slug === currentSlug);

  if (orgs.length <= 1) {
    return <span className="text-sm font-medium">{current?.name ?? currentSlug}</span>;
  }

  return (
    <select
      value={currentSlug}
      onChange={(e) => router.push(`/org/${e.target.value}`)}
      className="text-sm border rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
    >
      {orgs.map((org) => (
        <option key={org.id} value={org.slug}>
          {org.name}
        </option>
      ))}
    </select>
  );
}
