(function(root) {
  "use strict";

  class AdaptiveReplacementCache {
    constructor(capacity) {
      if (!Number.isInteger(capacity) || capacity < 1) {
        throw new Error("ARC capacity must be a positive integer.");
      }

      this.capacity = capacity;
      this.p = 0;
      this.hits = 0;
      this.misses = 0;

      // Real cache lists.
      this.t1 = [];
      this.t2 = [];

      // Ghost history lists.
      this.b1 = [];
      this.b2 = [];

      // Only real cache entries keep values.
      this.values = new Map();
    }

    get size() {
      return this.t1.length + this.t2.length;
    }

    has(key) {
      return this.inList(this.t1, key) || this.inList(this.t2, key);
    }

    get(key) {
      const result = this.readFromCache(key);

      if (!result.hit) {
        this.misses += 1;
        return undefined;
      }

      this.hits += 1;
      return result.value;
    }

    set(key, value) {
      const storedValue = arguments.length > 1 ? value : key;
      const result = this.readFromCache(key, storedValue);

      if (result.hit) {
        return {
          hit: true,
          source: result.source,
          value: result.value,
          note: result.source === "T1"
            ? "Updated entry and promoted it from T1 to T2."
            : "Updated entry in T2 and refreshed it to most recent."
        };
      }

      return this.admit(key, storedValue);
    }

    access(key, value) {
      const storedValue = arguments.length > 1 ? value : key;
      const result = this.readFromCache(key);

      if (result.hit) {
        this.hits += 1;
        return {
          hit: true,
          source: result.source,
          value: result.value,
          note: result.source === "T1"
            ? "Cache hit in T1; promoted into T2."
            : "Cache hit in T2; frequency history preserved."
        };
      }

      this.misses += 1;
      return this.admit(key, storedValue);
    }

    snapshot() {
      const totalRequests = this.hits + this.misses;

      return {
        capacity: this.capacity,
        size: this.size,
        p: this.p,
        hits: this.hits,
        misses: this.misses,
        hitRate: totalRequests ? this.hits / totalRequests : 0,
        t1: this.t1.slice(),
        t2: this.t2.slice(),
        b1: this.b1.slice(),
        b2: this.b2.slice()
      };
    }

    readFromCache(key, updatedValue) {
      if (this.inList(this.t1, key)) {
        const value = arguments.length > 1 ? updatedValue : this.values.get(key);
        this.removeFromList(this.t1, key);
        this.addMostRecent(this.t2, key);
        this.values.set(key, value);

        return {
          hit: true,
          source: "T1",
          value: value
        };
      }

      if (this.inList(this.t2, key)) {
        const value = arguments.length > 1 ? updatedValue : this.values.get(key);
        this.addMostRecent(this.t2, key);
        this.values.set(key, value);

        return {
          hit: true,
          source: "T2",
          value: value
        };
      }

      return {
        hit: false
      };
    }

    admit(key, value) {
      if (this.inList(this.b1, key)) {
        this.increaseTarget();

        const replacement = this.replace(key);
        this.removeFromList(this.b1, key);
        this.addMostRecent(this.t2, key);
        this.values.set(key, value);

        return {
          hit: false,
          source: "B1",
          value: value,
          note: "Ghost hit in B1; ARC shifts more space toward recency, then restores the item to T2." + formatReplacement(replacement)
        };
      }

      if (this.inList(this.b2, key)) {
        this.decreaseTarget();

        const replacement = this.replace(key);
        this.removeFromList(this.b2, key);
        this.addMostRecent(this.t2, key);
        this.values.set(key, value);

        return {
          hit: false,
          source: "B2",
          value: value,
          note: "Ghost hit in B2; ARC shifts more space toward frequency, then restores the item to T2." + formatReplacement(replacement)
        };
      }

      let replacement = null;
      let discarded = null;

      if (this.t1.length + this.b1.length === this.capacity) {
        if (this.t1.length < this.capacity) {
          this.removeLeastRecent(this.b1);
          replacement = this.replace(key);
        } else {
          discarded = this.removeLeastRecent(this.t1);
          this.values.delete(discarded);
        }
      } else if (this.t1.length + this.b1.length < this.capacity) {
        const totalLength = this.totalLength();

        if (totalLength >= this.capacity) {
          if (totalLength === 2 * this.capacity) {
            this.removeLeastRecent(this.b2);
          }

          replacement = this.replace(key);
        }
      }

      this.addMostRecent(this.t1, key);
      this.values.set(key, value);

      return {
        hit: false,
        source: "miss",
        value: value,
        note: "Cold miss; inserted into T1." + formatReplacement(replacement) + formatDiscard(discarded)
      };
    }

    replace(incomingKey) {
      const shouldMoveFromT1 =
        this.t1.length > 0 && (
          this.t2.length === 0 ||
          this.t1.length > this.p ||
          (this.inList(this.b2, incomingKey) && this.t1.length === this.p)
        );

      if (shouldMoveFromT1) {
        const victim = this.removeLeastRecent(this.t1);

        if (victim === null) {
          return null;
        }

        this.values.delete(victim);
        this.addMostRecent(this.b1, victim);

        return {
          key: victim,
          from: "T1",
          to: "B1"
        };
      }

      const victim = this.removeLeastRecent(this.t2);

      if (victim === null) {
        return null;
      }

      this.values.delete(victim);
      this.addMostRecent(this.b2, victim);

      return {
        key: victim,
        from: "T2",
        to: "B2"
      };
    }

    increaseTarget() {
      const delta = this.b1.length === 0 ? 1 : Math.max(1, Math.ceil(this.b2.length / this.b1.length));
      this.p = Math.min(this.capacity, this.p + delta);
    }

    decreaseTarget() {
      const delta = this.b2.length === 0 ? 1 : Math.max(1, Math.ceil(this.b1.length / this.b2.length));
      this.p = Math.max(0, this.p - delta);
    }

    totalLength() {
      return this.t1.length + this.t2.length + this.b1.length + this.b2.length;
    }

    inList(list, key) {
      return list.indexOf(key) !== -1;
    }

    addMostRecent(list, key) {
      this.removeFromList(list, key);
      list.unshift(key);
    }

    removeFromList(list, key) {
      const index = list.indexOf(key);

      if (index === -1) {
        return false;
      }

      list.splice(index, 1);
      return true;
    }

    removeLeastRecent(list) {
      return list.length ? list.pop() : null;
    }
  }

  function formatReplacement(replacement) {
    if (!replacement) {
      return "";
    }

    return " Moved " + replacement.key + " from " + replacement.from + " to " + replacement.to + ".";
  }

  function formatDiscard(key) {
    if (key === null) {
      return "";
    }

    return " Discarded " + key + " from T1 to free a real cache slot.";
  }

  function formatList(keys) {
    return keys.length ? keys.join(" -> ") : "empty";
  }

  function percent(value) {
    return (value * 100).toFixed(1) + "%";
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function runArcExample() {
    const sequence = ["A", "B", "C", "D", "A", "B", "E", "A", "B", "C", "D", "E", "F", "A", "E", "F"];
    const cache = new AdaptiveReplacementCache(4);

    const steps = sequence.map(function(key, index) {
      const result = cache.access(key, "Page " + key);
      const snapshot = cache.snapshot();

      return {
        step: index + 1,
        request: key,
        result: result,
        snapshot: snapshot
      };
    });

    return {
      sequence: sequence,
      steps: steps,
      finalState: cache.snapshot()
    };
  }

  function renderArcExample(doc) {
    const mount = doc.getElementById("app");

    if (!mount) {
      return;
    }

    const example = runArcExample();
    const finalState = example.finalState;

    const rows = example.steps.map(function(entry) {
      const badgeClass = entry.result.hit ? "tag tag-hit" : "tag tag-miss";
      const badgeText = entry.result.hit ? "hit" : entry.result.source === "miss" ? "cold miss" : "ghost miss";

      return "<tr>" +
        "<td>" + entry.step + "</td>" +
        "<td><strong>" + escapeHtml(entry.request) + "</strong></td>" +
        "<td><span class=\"" + badgeClass + "\">" + badgeText + "</span></td>" +
        "<td>" + escapeHtml(entry.result.note) + "</td>" +
        "<td>" + entry.snapshot.p + "</td>" +
        "<td>" + escapeHtml(formatList(entry.snapshot.t1)) + "</td>" +
        "<td>" + escapeHtml(formatList(entry.snapshot.t2)) + "</td>" +
        "<td>" + escapeHtml(formatList(entry.snapshot.b1)) + "</td>" +
        "<td>" + escapeHtml(formatList(entry.snapshot.b2)) + "</td>" +
      "</tr>";
    }).join("");

    mount.innerHTML = "" +
      "<section class=\"hero\">" +
        "<p class=\"eyebrow\">Pure JavaScript ARC demo</p>" +
        "<h1>Adaptive Replacement Cache</h1>" +
        "<p class=\"lede\">ARC keeps one eye on recency and another on frequency. The IBM algorithm learns which one matters more by watching two real cache lists and two ghost lists.</p>" +
      "</section>" +
      "<section class=\"metrics\">" +
        "<article class=\"metric\"><span class=\"metric-label\">Capacity</span><strong>" + finalState.capacity + "</strong><span class=\"metric-note\">real cache slots</span></article>" +
        "<article class=\"metric\"><span class=\"metric-label\">Hits</span><strong>" + finalState.hits + "</strong><span class=\"metric-note\">" + percent(finalState.hitRate) + " hit rate</span></article>" +
        "<article class=\"metric\"><span class=\"metric-label\">Misses</span><strong>" + finalState.misses + "</strong><span class=\"metric-note\">ghost misses adjust p</span></article>" +
        "<article class=\"metric\"><span class=\"metric-label\">Target p</span><strong>" + finalState.p + "</strong><span class=\"metric-note\">desired size of T1</span></article>" +
      "</section>" +
      "<section class=\"panel\">" +
        "<div class=\"panel-heading\">" +
          "<h2>How the four lists behave</h2>" +
          "<p>Each list is maintained as an LRU queue, with the most recently touched entry shown first.</p>" +
        "</div>" +
        "<div class=\"legend\">" +
          "<article class=\"legend-item\"><h3>T1</h3><p>Recent items seen once.</p><div class=\"list-chip\">" + escapeHtml(formatList(finalState.t1)) + "</div></article>" +
          "<article class=\"legend-item\"><h3>T2</h3><p>Frequent items seen at least twice.</p><div class=\"list-chip\">" + escapeHtml(formatList(finalState.t2)) + "</div></article>" +
          "<article class=\"legend-item\"><h3>B1</h3><p>Ghost history for items evicted from T1.</p><div class=\"list-chip\">" + escapeHtml(formatList(finalState.b1)) + "</div></article>" +
          "<article class=\"legend-item\"><h3>B2</h3><p>Ghost history for items evicted from T2.</p><div class=\"list-chip\">" + escapeHtml(formatList(finalState.b2)) + "</div></article>" +
        "</div>" +
      "</section>" +
      "<section class=\"panel\">" +
        "<div class=\"panel-heading\">" +
          "<h2>Request trace</h2>" +
          "<p>Sequence: <code>" + escapeHtml(example.sequence.join(" ")) + "</code></p>" +
        "</div>" +
        "<div class=\"table-wrap\">" +
          "<table class=\"result-table\">" +
            "<thead><tr><th>#</th><th>Key</th><th>Outcome</th><th>What ARC does</th><th>p</th><th>T1</th><th>T2</th><th>B1</th><th>B2</th></tr></thead>" +
            "<tbody>" + rows + "</tbody>" +
          "</table>" +
        "</div>" +
      "</section>";
  }

  root.AdaptiveReplacementCache = AdaptiveReplacementCache;
  root.runArcExample = runArcExample;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      AdaptiveReplacementCache: AdaptiveReplacementCache,
      runArcExample: runArcExample
    };
  }

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function() {
      renderArcExample(document);
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
