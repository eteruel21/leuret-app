import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { listJobRequestFeed } from "@/services/job-request-service";

/**
 * Texto y contador del acceso «Peticiones» del inicio del contratista.
 * Con `companyId` null no consulta nada (rol sin permiso o sin empresa).
 */
export function useJobRequestsHomeSummary(companyId: string | null) {
  const [matching, setMatching] = useState<number | null>(null);
  const [unread, setUnread] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!companyId) return;
      let active = true;
      void Promise.all([
        listJobRequestFeed(companyId, { scope: "matching", limit: 1 }),
        listJobRequestFeed(companyId, { scope: "engaged", limit: 50 }),
      ]).then(([matchingResult, engagedResult]) => {
        if (!active) return;
        if (matchingResult.feed) setMatching(matchingResult.feed.counts.matching);
        if (engagedResult.feed) {
          setUnread(engagedResult.feed.requests.reduce((sum, request) => sum + request.unread_count, 0));
        }
      });
      return () => {
        active = false;
      };
    }, [companyId]),
  );

  const subtitle =
    unread > 0
      ? `${unread} mensaje${unread === 1 ? "" : "s"} nuevo${unread === 1 ? "" : "s"}`
      : matching
        ? `${matching} abierta${matching === 1 ? "" : "s"} en tu zona`
        : "Trabajos publicados por clientes";

  return { subtitle, badge: unread || matching || 0 };
}
