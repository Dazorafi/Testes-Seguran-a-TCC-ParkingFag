import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ParkingMap } from "../ParkingMap";
import type { Spot } from "../types";

afterEach(cleanup);

describe("SEC-XSS: untrusted API text in real React component",()=>{
  for(const payload of ["<script>globalThis.securityProbe=1</script>",'<img src=x onerror="globalThis.securityProbe=1">','${7*7}']) {
    it(`renders payload as text: ${payload}`,()=>{
      const spot:Spot={spotCode:payload,sector:payload,status:"FREE",accessible:false,layoutOrder:0,
        polygon:[{x:.1,y:.1},{x:.2,y:.1},{x:.2,y:.2}],
        lastObserved:"2026-10-28T12:00:00Z",lastUpdated:"2026-10-28T12:00:00Z"};
      const {container}=render(<ParkingMap spots={[spot]} panelOnly />);
      expect(screen.getAllByText(payload).length).toBeGreaterThan(0);
      expect(container.querySelectorAll("script,img,[onerror]")).toHaveLength(0);
      expect(container.textContent).toContain(payload);
    });
  }
});
