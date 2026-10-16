# iOS Shortcut setup: "Sync Hydration"

This Shortcut reads today's water from Apple Health and sends it to your HidrateLens Worker.

You'll need:
- your Worker URL (e.g. `https://hidratelens.<you>.workers.dev`)
- your **WRITE_TOKEN**

Before you start, make sure the HidrateSpark app has permission to **write Water** to Apple Health: Health app → Sharing → Apps → HidrateSpark.

## Build the Shortcut

Open **Shortcuts**, tap **+**, and name the Shortcut **Sync Hydration**. Then add these actions in order.

1. **Find Health Samples**
   - Type: **Dietary Water**
   - Filter: **Start Date** *is today*
   - Sort by: **Start Date**, *Latest First*
   - Unit: **mL**

   <!-- screenshot: find-health-samples -->

2. **Calculate Statistics**: **Sum** of *Health Samples*. Rename the result to `totalMl`.

3. **Get Item from List**: **First Item** of *Health Samples*.
   - Then **Get Details of Health Sample**: **Start Date**.
   - Then **Format Date**: **ISO 8601**, with **Include Time** on. Rename it to `lastDrinkAt`.

   If there's no water yet today, these steps produce nothing; see the tip at the end.

4. **Number**: your daily goal **in mL**, for example `2366` for 80 oz. Rename it to `goalMl`.

5. **Current Date**, then **Format Date** with *Custom* format `yyyy-MM-dd`. Rename it to `today`.

6. **Get Contents of URL**
   - URL: `https://<your-worker-url>/api/intake`
   - Method: **POST**
   - Headers:
     - `Authorization`: `Bearer <WRITE_TOKEN>`
     - `Content-Type`: `application/json`
   - Request Body: **JSON**, with these fields:

     | Key | Type | Value |
     |-----|------|-------|
     | `date` | Text | `today` |
     | `totalMl` | **Number** | `totalMl` |
     | `goalMl` | **Number** | `goalMl` |
     | `lastDrinkAt` | Text | `lastDrinkAt` |
     | `tz` | Text | your time zone, e.g. `America/New_York` |

   <!-- screenshot: get-contents-of-url -->

> **Use the Number type for `totalMl` and `goalMl`.** If you send them as Text, the Worker rejects the sync with `totalMl invalid`.

Run the Shortcut once by hand. It should show `{"ok":true}`.

## Automations

Go to **Shortcuts → Automation → +** and create these, each set to **Run Immediately** with **Notify When Run** off:

- **App → HidrateSpark → Is Closed** → run *Sync Hydration*. This is the main trigger, because the app syncs the bottle while it's open.
- **Time of Day** at 9:00, 12:00, 15:00, 18:00 and 21:00 → run *Sync Hydration*. These are backups and only succeed when the phone is unlocked.

<!-- screenshot: automations -->

## Troubleshooting

| Response | Fix |
|----------|-----|
| `unauthorized` | Check the `Authorization` header: it's `Bearer `, then a space, then the WRITE_TOKEN. |
| `totalMl invalid` / `goalMl invalid` | Set the field type to **Number**, and check the unit is **mL**. |
| `date invalid` | The date format must be exactly `yyyy-MM-dd`. |
| `lastDrinkAt invalid` | Use Format Date → **ISO 8601** with **Include Time** on. |
| Nothing happens while the phone is locked | Expected: iOS blocks Health access while locked. The next run after unlocking will sync. |

**Tip, for when there's no water yet today:** wrap steps 2–6 in **If** *Health Samples* **has any value**, and leave **Otherwise** empty. Before your first sip, the glasses then show `0 / 80 oz` and `No sync yet today`, and the first sync after you drink fills them in.
