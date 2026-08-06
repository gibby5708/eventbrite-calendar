const fs = require("fs");

const EVENTBRITE_API_BASE = "https://www.eventbriteapi.com/v3";
const token = process.env.EVENTBRITE_TOKEN;
const configuredOrganizationId = process.env.EVENTBRITE_ORGANIZATION_ID || "";

if (!token) {
  throw new Error("Missing EVENTBRITE_TOKEN GitHub secret.");
}

async function main() {
  const organizationId = await getWorkingOrganizationId();
  const events = await loadAllEvents(organizationId);

  fs.writeFileSync(
    "events.json",
    JSON.stringify(
      {
        events,
        organizationId,
        updatedAt: new Date().toISOString()
      },
      null,
      2
    )
  );
}

async function getWorkingOrganizationId() {
  if (configuredOrganizationId && configuredOrganizationId.toUpperCase() !== "AUTO") {
    try {
      await requestEventbrite(`/organizations/${encodeURIComponent(configuredOrganizationId)}/events/?page_size=1`);
      return configuredOrganizationId;
    } catch (error) {
      if (!String(error.message || "").match(/organization/i)) {
        throw error;
      }
    }
  }

  const payload = await requestEventbrite("/users/me/organizations/");
  const organizations = payload.organizations || [];

  if (!organizations.length) {
    throw new Error("No Eventbrite organizations were found for this token.");
  }

  return organizations[0].id;
}

async function loadAllEvents(organizationId) {
  const events = [];
  let continuation = "";

  do {
    const params = new URLSearchParams({
      status: "live",
      time_filter: "current_future",
      order_by: "start_asc",
      expand: "venue,organizer,ticket_availability"
    });

    if (continuation) {
      params.set("continuation", continuation);
    }

    const payload = await requestEventbrite(`/organizations/${encodeURIComponent(organizationId)}/events/?${params}`);
    events.push(...(payload.events || []).map(simplifyEvent));
    continuation = payload.pagination && payload.pagination.has_more_items
      ? payload.pagination.continuation
      : "";
  } while (continuation);

  return events;
}

function simplifyEvent(rawEvent) {
  const venue = rawEvent.venue || {};
  const address = venue.address || {};
  const logo = rawEvent.logo || {};

  return {
    id: rawEvent.id,
    name: rawEvent.name,
    summary: rawEvent.summary || "",
    description: rawEvent.description && rawEvent.description.text
      ? { text: rawEvent.description.text }
      : undefined,
    url: rawEvent.url,
    logo: {
      url: logo.url || "",
      original: logo.original && logo.original.url
        ? { url: logo.original.url }
        : undefined
    },
    start: rawEvent.start,
    end: rawEvent.end,
    online_event: rawEvent.online_event,
    venue: {
      name: venue.name || "",
      address: {
        localized_address_display: address.localized_address_display || "",
        address_1: address.address_1 || ""
      }
    }
  };
}

async function requestEventbrite(path) {
  const response = await fetch(`${EVENTBRITE_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || `Eventbrite returned ${response.status}`);
  }

  return payload;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
