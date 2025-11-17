package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// QueryRequest represents a log query request
type QueryRequest struct {
	Query     string            `json:"query"`
	From      *time.Time        `json:"from,omitempty"`
	To        *time.Time        `json:"to,omitempty"`
	Size      int               `json:"size,omitempty"`
	Sort      []string          `json:"sort,omitempty"`
	Fields    []string          `json:"fields,omitempty"`
	Filters   map[string]string `json:"filters,omitempty"`
}

// QueryResponse represents the query response
type QueryResponse struct {
	Hits      []map[string]interface{} `json:"hits"`
	Total     int                      `json:"total"`
	Took      int64                    `json:"took_ms"`
	From      int                      `json:"from"`
	Size      int                      `json:"size"`
}

// QueryLogs handles log queries
func (h *Handler) QueryLogs(w http.ResponseWriter, r *http.Request) {
	span := trace.SpanFromContext(r.Context())
	span.SetAttributes(attribute.String("handler", "queryLogs"))

	w.Header().Set("Content-Type", "application/json")

	var req QueryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.logger.Warn("Invalid query request", map[string]interface{}{
			"error": err.Error(),
		})
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Invalid request format",
		})
		return
	}
	defer r.Body.Close()

	// Set defaults
	if req.Size == 0 {
		req.Size = 100
	}
	if req.Size > 1000 {
		req.Size = 1000 // Max limit
	}

	// Build OpenSearch query
	searchQuery := h.buildSearchQuery(req)

	// Execute search
	searchURL := h.openSearchURL[:len(h.openSearchURL)-5] + "/_search" // Remove "_doc" and add "_search"

	jsonQuery, err := json.Marshal(searchQuery)
	if err != nil {
		h.logger.Error("Failed to marshal search query", map[string]interface{}{
			"error": err.Error(),
		})
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Internal server error",
		})
		return
	}

	start := time.Now()
	resp, err := h.httpClient.Post(searchURL, "application/json", bytes.NewBuffer(jsonQuery))
	if err != nil {
		h.logger.Error("Failed to query OpenSearch", map[string]interface{}{
			"error": err.Error(),
		})
		span.RecordError(err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Failed to query logs",
		})
		return
	}
	defer resp.Body.Close()

	took := time.Since(start).Milliseconds()

	if resp.StatusCode >= 400 {
		h.logger.Error("OpenSearch returned error", map[string]interface{}{
			"status_code": resp.StatusCode,
		})
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Failed to query logs",
		})
		return
	}

	// Parse OpenSearch response
	var searchResult struct {
		Hits struct {
			Total struct {
				Value int `json:"value"`
			} `json:"total"`
			Hits []struct {
				Source map[string]interface{} `json:"_source"`
			} `json:"hits"`
		} `json:"hits"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&searchResult); err != nil {
		h.logger.Error("Failed to decode search results", map[string]interface{}{
			"error": err.Error(),
		})
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Failed to parse results",
		})
		return
	}

	// Build response
	hits := make([]map[string]interface{}, len(searchResult.Hits.Hits))
	for i, hit := range searchResult.Hits.Hits {
		hits[i] = hit.Source
	}

	response := QueryResponse{
		Hits:  hits,
		Total: searchResult.Hits.Total.Value,
		Took:  took,
		From:  0,
		Size:  req.Size,
	}

	h.logger.Info("Query executed successfully", map[string]interface{}{
		"total_hits": response.Total,
		"took_ms":    took,
	})

	json.NewEncoder(w).Encode(response)
}

func (h *Handler) buildSearchQuery(req QueryRequest) map[string]interface{} {
	query := map[string]interface{}{
		"size": req.Size,
		"query": map[string]interface{}{
			"bool": map[string]interface{}{
				"must": []interface{}{},
			},
		},
	}

	boolQuery := query["query"].(map[string]interface{})["bool"].(map[string]interface{})
	must := boolQuery["must"].([]interface{})

	// Add query string if provided
	if req.Query != "" {
		must = append(must, map[string]interface{}{
			"query_string": map[string]interface{}{
				"query": req.Query,
			},
		})
	}

	// Add time range filter
	if req.From != nil || req.To != nil {
		rangeFilter := map[string]interface{}{
			"range": map[string]interface{}{
				"timestamp": map[string]interface{}{},
			},
		}

		rangeQuery := rangeFilter["range"].(map[string]interface{})["timestamp"].(map[string]interface{})
		if req.From != nil {
			rangeQuery["gte"] = req.From.Format(time.RFC3339)
		}
		if req.To != nil {
			rangeQuery["lte"] = req.To.Format(time.RFC3339)
		}

		must = append(must, rangeFilter)
	}

	// Add field filters
	for field, value := range req.Filters {
		must = append(must, map[string]interface{}{
			"term": map[string]interface{}{
				field: value,
			},
		})
	}

	boolQuery["must"] = must

	// Add sorting
	if len(req.Sort) > 0 {
		sorts := make([]interface{}, len(req.Sort))
		for i, sortField := range req.Sort {
			sorts[i] = map[string]interface{}{
				sortField: map[string]string{"order": "desc"},
			}
		}
		query["sort"] = sorts
	} else {
		// Default sort by timestamp
		query["sort"] = []interface{}{
			map[string]interface{}{
				"timestamp": map[string]string{"order": "desc"},
			},
		}
	}

	// Add field filtering if specified
	if len(req.Fields) > 0 {
		query["_source"] = req.Fields
	}

	return query
}

// GetMetricsStats returns metrics statistics
func (h *Handler) GetMetricsStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Parse query parameters
	from := r.URL.Query().Get("from")
	to := r.URL.Query().Get("to")
	metric := r.URL.Query().Get("metric")

	var fromTime, toTime time.Time
	var err error

	if from != "" {
		fromTime, err = time.Parse(time.RFC3339, from)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Invalid 'from' time format",
			})
			return
		}
	} else {
		fromTime = time.Now().Add(-1 * time.Hour)
	}

	if to != "" {
		toTime, err = time.Parse(time.RFC3339, to)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Invalid 'to' time format",
			})
			return
		}
	} else {
		toTime = time.Now()
	}

	// This would typically query Prometheus or a metrics database
	// For now, return mock data structure
	stats := map[string]interface{}{
		"metric": metric,
		"from":   fromTime.Format(time.RFC3339),
		"to":     toTime.Format(time.RFC3339),
		"data":   []map[string]interface{}{},
	}

	json.NewEncoder(w).Encode(stats)
}

// GetLogAggregations returns log aggregations
func (h *Handler) GetLogAggregations(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	field := r.URL.Query().Get("field")
	if field == "" {
		field = "level"
	}

	// Build aggregation query
	aggQuery := map[string]interface{}{
		"size": 0,
		"aggs": map[string]interface{}{
			"field_agg": map[string]interface{}{
				"terms": map[string]interface{}{
					"field": field,
					"size":  50,
				},
			},
		},
	}

	searchURL := h.openSearchURL[:len(h.openSearchURL)-5] + "/_search"

	jsonQuery, err := json.Marshal(aggQuery)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Internal server error",
		})
		return
	}

	resp, err := h.httpClient.Post(searchURL, "application/json", bytes.NewBuffer(jsonQuery))
	if err != nil {
		h.logger.Error("Failed to query aggregations", map[string]interface{}{
			"error": err.Error(),
		})
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Failed to get aggregations",
		})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Failed to get aggregations",
		})
		return
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Failed to parse results",
		})
		return
	}

	json.NewEncoder(w).Encode(result)
}

// GetSystemStats returns system statistics
func (h *Handler) GetSystemStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	stats := map[string]interface{}{
		"timestamp": time.Now().Format(time.RFC3339),
		"uptime":    time.Since(startTime).Seconds(),
		"version":   "1.0.0",
		"status":    "healthy",
	}

	json.NewEncoder(w).Encode(stats)
}

var startTime = time.Now()
