(function () {
  "use strict";

  var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function startOfWeek(date) {
    var result = startOfDay(date);
    result.setDate(result.getDate() - result.getDay());
    return result;
  }

  function addDays(date, days) {
    var result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[character];
    });
  }

  function normalizeEvent(rawEvent) {
    var startLocal = rawEvent.start && (rawEvent.start.local || rawEvent.start.utc);
    var endLocal = rawEvent.end && (rawEvent.end.local || rawEvent.end.utc);
    var startDate = startLocal ? new Date(startLocal) : null;
    var endDate = endLocal ? new Date(endLocal) : null;
    var logo = rawEvent.logo || {};
    var venue = rawEvent.venue || {};
    var address = venue.address || {};

    return {
      id: rawEvent.id,
      title: (rawEvent.name && rawEvent.name.text) || "Untitled event",
      description: (rawEvent.summary || (rawEvent.description && rawEvent.description.text) || "").trim(),
      url: rawEvent.url || ("https://www.eventbrite.com/e/" + rawEvent.id),
      imageUrl: (logo.original && logo.original.url) || logo.url || "",
      start: startDate,
      end: endDate,
      timezone: (rawEvent.start && rawEvent.start.timezone) || "",
      venueName: venue.name || (rawEvent.online_event ? "Online event" : ""),
      location: address.localized_address_display || address.address_1 || ""
    };
  }

  function formatDateRange(event, includeDate, timezone) {
    if (!event.start) {
      return "";
    }

    var dateOptions = includeDate
      ? { weekday: "short", month: "short", day: "numeric", year: "numeric" }
      : { weekday: "short" };
    var timeOptions = { hour: "numeric", minute: "2-digit" };

    if (timezone) {
      dateOptions.timeZone = timezone;
      timeOptions.timeZone = timezone;
    }

    var dateText = event.start.toLocaleDateString(undefined, dateOptions);
    var startText = event.start.toLocaleTimeString(undefined, timeOptions);
    var endText = event.end ? event.end.toLocaleTimeString(undefined, timeOptions) : "";

    return dateText + " @ " + startText + (endText ? " - " + endText : "");
  }

  function eventMatchesSearch(event, query) {
    if (!query) {
      return true;
    }

    var haystack = [event.title, event.description, event.venueName, event.location].join(" ").toLowerCase();
    return haystack.indexOf(query.toLowerCase()) !== -1;
  }

  function loadJsonp(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var callbackName = "inetEventbriteCalendarCallback_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
      var script = document.createElement("script");
      var separator = url.indexOf("?") === -1 ? "?" : "&";
      var timeout = timeoutMs > 0
        ? window.setTimeout(function () {
          cleanup();
          reject(new Error("Eventbrite request timed out."));
        }, timeoutMs)
        : null;

      function cleanup() {
        if (timeout) {
          window.clearTimeout(timeout);
        }
        delete window[callbackName];
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
      }

      window[callbackName] = function (payload) {
        cleanup();
        resolve(payload);
      };

      script.onerror = function () {
        cleanup();
        reject(new Error("Could not load Eventbrite events."));
      };
      script.src = url + separator + "callback=" + encodeURIComponent(callbackName);
      document.head.appendChild(script);
    });
  }

  function loadFrameMessage(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var requestId = "inet-frame-" + Date.now() + "-" + Math.floor(Math.random() * 100000);
      var iframe = document.createElement("iframe");
      var separator = url.indexOf("?") === -1 ? "?" : "&";
      var timeout = timeoutMs > 0
        ? window.setTimeout(function () {
          cleanup();
          reject(new Error("Eventbrite data frame timed out."));
        }, timeoutMs)
        : null;

      function cleanup() {
        if (timeout) {
          window.clearTimeout(timeout);
        }
        window.removeEventListener("message", handleMessage);
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }

      function handleMessage(event) {
        var data = event.data || {};

        if (data.type !== "inet-eventbrite-calendar" || data.requestId !== requestId) {
          return;
        }

        cleanup();
        resolve(data.payload);
      }

      window.addEventListener("message", handleMessage);
      iframe.style.display = "none";
      iframe.setAttribute("aria-hidden", "true");
      iframe.src = url + separator + "transport=frame&requestId=" + encodeURIComponent(requestId);
      document.body.appendChild(iframe);
    });
  }

  function isLikelyMobile() {
    return /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (window.matchMedia && window.matchMedia("(max-width: 760px)").matches);
  }

  function loadCalendarPayload(url, config) {
    var primaryTimeoutMs = config.primaryLoadTimeoutMs || 7000;
    var fallbackTimeoutMs = config.fallbackLoadTimeoutMs || 30000;

    if (config.transport === "jsonp") {
      if (config.preferFrameOnMobile !== false && isLikelyMobile()) {
        return loadFrameMessage(url, fallbackTimeoutMs)
          .catch(function () {
            return loadJsonp(url, primaryTimeoutMs);
          });
      }

      return loadJsonp(url, primaryTimeoutMs)
        .catch(function () {
          return loadFrameMessage(url, fallbackTimeoutMs);
        });
    }

    return fetch(url, { headers: { Accept: "application/json" } })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Eventbrite request failed with status " + response.status);
        }
        return response.json();
      });
  }

  function createEventCard(event, compact, timezone) {
    var imageHtml = event.imageUrl
      ? '<img src="' + escapeHtml(event.imageUrl) + '" alt="">'
      : "";
    var locationHtml = event.venueName || event.location
      ? '<div class="inet-event-meta">' + escapeHtml([event.venueName, event.location].filter(Boolean).join(", ")) + "</div>"
      : "";

    return (
      '<a class="inet-event-card" href="' + escapeHtml(event.url) + '" target="_blank" rel="noopener">' +
      imageHtml +
      '<div class="inet-event-title">' + escapeHtml(event.title) + "</div>" +
      '<div class="inet-event-meta">' + escapeHtml(formatDateRange(event, !compact, timezone)) + "</div>" +
      locationHtml +
      '<span class="inet-calendar-register">Register</span>' +
      "</a>"
    );
  }

  function createListRow(event, timezone) {
    var imageHtml = event.imageUrl
      ? '<img src="' + escapeHtml(event.imageUrl) + '" alt="">'
      : '<div aria-hidden="true"></div>';
    var locationHtml = event.venueName || event.location
      ? '<div class="inet-event-meta">' + escapeHtml([event.venueName, event.location].filter(Boolean).join(", ")) + "</div>"
      : "";

    return (
      '<article class="inet-calendar-list-row">' +
      imageHtml +
      '<div class="inet-calendar-list-content">' +
      '<div class="inet-event-title">' + escapeHtml(event.title) + "</div>" +
      '<div class="inet-event-meta">' + escapeHtml(formatDateRange(event, true, timezone)) + "</div>" +
      locationHtml +
      "</div>" +
      '<div class="inet-calendar-list-actions">' +
      '<a class="inet-calendar-register" href="' + escapeHtml(event.url) + '" target="_blank" rel="noopener">Register</a>' +
      "</div>" +
      "</article>"
    );
  }

  function EventbriteCalendar(config) {
    this.config = Object.assign(
      {
        target: "#inet-eventbrite-calendar",
        defaultView: "month",
        refreshMinutes: 5,
        brandName: "Events",
        timezone: "",
        primaryLoadTimeoutMs: 7000,
        fallbackLoadTimeoutMs: 30000,
        preferFrameOnMobile: true
      },
      config || {}
    );
    this.root = document.querySelector(this.config.target);
    this.activeDate = new Date();
    this.view = this.config.defaultView || "month";
    this.events = [];
    this.query = "";
    this.isLoading = true;
    this.error = "";
  }

  EventbriteCalendar.prototype.init = function () {
    if (!this.root) {
      return;
    }

    this.root.className = "inet-calendar";
    this.bindShell();

    if (this.config.initialPayload) {
      try {
        this.applyPayload(this.config.initialPayload);
      } catch (error) {
        this.isLoading = false;
        this.error = error.message || "Could not load Eventbrite events.";
        this.render();
      }
    } else {
      this.fetchEvents();
    }

    if (this.config.refreshMinutes > 0) {
      window.setInterval(this.fetchEvents.bind(this), this.config.refreshMinutes * 60 * 1000);
    }
  };

  EventbriteCalendar.prototype.bindShell = function () {
    this.root.innerHTML =
      '<section class="inet-calendar-shell" aria-label="' + escapeHtml(this.config.brandName) + ' event calendar">' +
      '<div class="inet-calendar-toolbar">' +
      '<div class="inet-calendar-nav">' +
      '<button class="inet-calendar-icon-button" type="button" data-action="previous" aria-label="Previous period">&lt;</button>' +
      '<div class="inet-calendar-current" data-current></div>' +
      '<button class="inet-calendar-icon-button" type="button" data-action="next" aria-label="Next period">&gt;</button>' +
      "</div>" +
      '<form class="inet-calendar-search" data-search-form>' +
      '<label class="inet-calendar-sr-only" for="inet-calendar-search-input">Search events</label>' +
      '<input id="inet-calendar-search-input" type="search" placeholder="Search events here..." autocomplete="off">' +
      '<button class="inet-calendar-search-button" type="submit" aria-label="Search">Search</button>' +
      "</form>" +
      '<div class="inet-calendar-views" role="group" aria-label="Calendar views">' +
      '<button class="inet-calendar-view-button" type="button" data-view="month">Month</button>' +
      '<button class="inet-calendar-view-button" type="button" data-view="week">Week</button>' +
      '<button class="inet-calendar-view-button" type="button" data-view="list">List</button>' +
      '<button class="inet-calendar-today" type="button" data-action="today">Today</button>' +
      "</div>" +
      "</div>" +
      '<h2 class="inet-calendar-heading" data-heading></h2>' +
      '<div data-body></div>' +
      "</section>";

    this.root.addEventListener("click", this.handleClick.bind(this));
    this.root.querySelector("[data-search-form]").addEventListener("submit", this.handleSearch.bind(this));
    this.root.querySelector("#inet-calendar-search-input").addEventListener("input", this.handleSearch.bind(this));
    this.render();
  };

  EventbriteCalendar.prototype.handleClick = function (event) {
    var actionButton = event.target.closest("[data-action]");
    var viewButton = event.target.closest("[data-view]");

    if (actionButton) {
      var action = actionButton.getAttribute("data-action");
      if (action === "previous") {
        this.movePeriod(-1);
      } else if (action === "next") {
        this.movePeriod(1);
      } else if (action === "today") {
        this.activeDate = new Date();
        this.render();
      }
    }

    if (viewButton) {
      this.view = viewButton.getAttribute("data-view");
      this.render();
    }
  };

  EventbriteCalendar.prototype.handleSearch = function (event) {
    event.preventDefault();
    this.query = this.root.querySelector("#inet-calendar-search-input").value.trim();
    this.render();
  };

  EventbriteCalendar.prototype.movePeriod = function (direction) {
    var nextDate = new Date(this.activeDate);

    if (this.view === "week") {
      nextDate.setDate(nextDate.getDate() + direction * 7);
    } else {
      nextDate.setMonth(nextDate.getMonth() + direction);
    }

    this.activeDate = nextDate;
    this.render();
  };

  EventbriteCalendar.prototype.fetchEvents = function () {
    var self = this;

    if (!this.config.proxyUrl || this.config.proxyUrl.indexOf("YOUR-WORKER-URL") !== -1) {
      this.isLoading = false;
      this.error = "Calendar proxy URL is not configured yet.";
      this.render();
      return;
    }

    this.isLoading = true;
    this.error = "";
    this.render();

    loadCalendarPayload(this.config.proxyUrl, this.config)
      .then(function (payload) {
        self.applyPayload(payload);
      })
      .catch(function (error) {
        self.isLoading = false;
        self.error = error.message || "Could not load Eventbrite events.";
        self.render();
      });
  };

  EventbriteCalendar.prototype.applyPayload = function (payload) {
    if (payload && payload.error) {
      throw new Error(payload.error);
    }

    var rawEvents = Array.isArray(payload.events) ? payload.events : payload;
    this.events = rawEvents
      .map(normalizeEvent)
      .filter(function (event) {
        return event.start && event.url;
      })
      .sort(function (a, b) {
        return a.start - b.start;
      });
    this.isLoading = false;
    this.error = "";
    this.render();
  };

  EventbriteCalendar.prototype.visibleEvents = function () {
    var self = this;
    return this.events.filter(function (event) {
      return eventMatchesSearch(event, self.query);
    });
  };

  EventbriteCalendar.prototype.render = function () {
    if (!this.root) {
      return;
    }

    this.root.querySelectorAll("[data-view]").forEach(function (button) {
      button.setAttribute("aria-pressed", button.getAttribute("data-view") === this.view ? "true" : "false");
    }, this);

    this.root.querySelector("[data-current]").textContent = this.getCurrentLabel();
    this.root.querySelector("[data-heading]").textContent = this.getHeadingLabel();

    if (this.isLoading) {
      this.root.querySelector("[data-body]").innerHTML = '<div class="inet-calendar-status">Loading Eventbrite events...</div>';
      return;
    }

    if (this.error) {
      this.root.querySelector("[data-body]").innerHTML = '<div class="inet-calendar-status is-error">' + escapeHtml(this.error) + "</div>";
      return;
    }

    if (this.view === "week") {
      this.renderWeek();
    } else if (this.view === "list") {
      this.renderList();
    } else {
      this.renderMonth();
    }
  };

  EventbriteCalendar.prototype.getCurrentLabel = function () {
    if (this.view === "week") {
      var weekStart = startOfWeek(this.activeDate);
      var weekEnd = addDays(weekStart, 6);
      return weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
        " - " +
        weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    }

    return MONTHS[this.activeDate.getMonth()] + " " + this.activeDate.getFullYear();
  };

  EventbriteCalendar.prototype.getHeadingLabel = function () {
    if (this.view === "week") {
      return "Week of " + startOfWeek(this.activeDate).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
    }

    if (this.view === "list") {
      return "Upcoming Events";
    }

    return (MONTHS[this.activeDate.getMonth()] + " " + this.activeDate.getFullYear()).toUpperCase();
  };

  EventbriteCalendar.prototype.renderMonth = function () {
    var monthStart = new Date(this.activeDate.getFullYear(), this.activeDate.getMonth(), 1);
    var gridStart = startOfWeek(monthStart);
    var today = startOfDay(new Date());
    var events = this.visibleEvents();
    var html = '<div class="inet-calendar-grid">';

    WEEKDAYS.forEach(function (weekday) {
      html += '<div class="inet-calendar-weekday">' + weekday + "</div>";
    });

    for (var index = 0; index < 42; index += 1) {
      var day = addDays(gridStart, index);
      var dayEvents = events.filter(function (event) {
        return sameDay(event.start, day);
      });
      var classes = ["inet-calendar-day"];
      if (day.getMonth() !== this.activeDate.getMonth()) {
        classes.push("is-outside");
      }
      if (sameDay(day, today)) {
        classes.push("is-today");
      }

      html += '<div class="' + classes.join(" ") + '">';
      html += '<div class="inet-calendar-date">' + day.getDate() + "</div>";
      dayEvents.forEach(function (event) {
        html += createEventCard(event, true, this.config.timezone);
      }, this);
      html += "</div>";
    }

    html += "</div>";
    this.root.querySelector("[data-body]").innerHTML = html;
  };

  EventbriteCalendar.prototype.renderWeek = function () {
    var weekStart = startOfWeek(this.activeDate);
    var events = this.visibleEvents();
    var html = '<div class="inet-calendar-week">';

    for (var index = 0; index < 7; index += 1) {
      var day = addDays(weekStart, index);
      var dayEvents = events.filter(function (event) {
        return sameDay(event.start, day);
      });
      html += '<section class="inet-calendar-week-column">';
      html += '<div class="inet-calendar-week-title">' + escapeHtml(day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })) + "</div>";
      html += dayEvents.length
        ? dayEvents.map(function (event) { return createEventCard(event, false, this.config.timezone); }, this).join("")
        : '<div class="inet-event-meta">No events</div>';
      html += "</section>";
    }

    html += "</div>";
    this.root.querySelector("[data-body]").innerHTML = html;
  };

  EventbriteCalendar.prototype.renderList = function () {
    var now = startOfDay(new Date());
    var events = this.visibleEvents().filter(function (event) {
      return event.start >= now;
    });

    this.root.querySelector("[data-body]").innerHTML = events.length
      ? '<div class="inet-calendar-list">' + events.map(function (event) { return createListRow(event, this.config.timezone); }, this).join("") + "</div>"
      : '<div class="inet-calendar-status">No upcoming events found.</div>';
  };

  document.addEventListener("DOMContentLoaded", function () {
    var calendar = new EventbriteCalendar(window.INETEventbriteCalendarConfig || {});
    calendar.init();
  });
}());
