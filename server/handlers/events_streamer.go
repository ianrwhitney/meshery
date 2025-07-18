package handlers

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"encoding/json"

	"github.com/gofrs/uuid"
	"github.com/gorilla/mux"
	"github.com/meshery/meshery/server/meshes"
	"github.com/meshery/meshery/server/models"
	"github.com/meshery/meshkit/errors"
	"github.com/meshery/meshkit/logger"
	"github.com/meshery/meshkit/models/events"
	_events "github.com/meshery/meshkit/utils/events"
)

var (
	flusherMap map[string]http.Flusher
)

type eventStatusPayload struct {
	Status    string       `json:"status"`
	StatusIDs []*uuid.UUID `json:"ids"`
}

type statusIDs struct {
	IDs []*uuid.UUID `json:"ids"`
}

// swagger:route GET /api/system/events EventsAPI idGetEventStreamer
// Handle GET request for events.
// ```search={description}``` If search is non empty then a search is performed on event description
// ```?category=[eventcategory] Returns event belonging to provided categories ```
// ```?action=[eventaction] Returns events belonging to provided actions ```
// ```?status={[read/unread]}``` Return events filtered on event status Default is unread````
// ```?severity=[eventseverity] Returns events belonging to provided severities ```
// ```?sort={field} order the records based on passed field, defaults to updated_at```
// ```?order={[asc/desc]}``` Default behavior is desc
// ```?page={page-number}``` Default page number is 0
// ```?pagesize={pagesize}``` Default pagesize is 25. To return all results: ```pagesize=all```
// responses:
// 	200: eventsResponseWrapper

func (h *Handler) GetAllEvents(w http.ResponseWriter, req *http.Request, prefObj *models.Preference, user *models.User, provider models.Provider) {
	userID := uuid.FromStringOrNil(user.ID)
	page, offset, limit,
		search, order, sortOnCol, status := getPaginationParams(req)
	fmt.Println(page)
	// eventCategory :=
	filter, err := getEventFilter(req)
	if err != nil {
		h.log.Warn(err)
	}
	filter.Limit = limit
	filter.Offset = offset
	filter.Order = order
	filter.SortOn = sortOnCol
	filter.Search = search
	filter.Status = events.EventStatus(status)

	ctx := req.Context()
	token, _ := ctx.Value(models.TokenCtxKey).(string)

	e, err := provider.GetEvents(token, filter, page, userID, *h.SystemID)

	if err != nil || e == nil {
		h.log.Error(ErrGetEvents(err))
		http.Error(w, ErrGetEvents(err).Error(), http.StatusInternalServerError)
	}
	err = json.NewEncoder(w).Encode(e)

	if err != nil {
		h.log.Error(models.ErrMarshal(err, "events response"))
		http.Error(w, models.ErrMarshal(err, "events response").Error(), http.StatusInternalServerError)
		return
	}

	// w.Header().Set("Content-Type", "application/json")
	// w.Write(e)

	// eventsResult, err := provider.GetAllEvents(filter, userID, *h.SystemID)
	// eventsR ,err := provider.GetEvents(token string, page string, pageSize string, search string, order string)
	// //
	// if err != nil {
	// 	h.log.Error(ErrGetEvents(err))
	// 	http.Error(w, ErrGetEvents(err).Error(), http.StatusInternalServerError)
	// 	return
	// }

	// eventsResult.Page = pa
	// err = json.NewEncoder(w).Encode(eventsResult)
	// if err != nil {
	// 	h.log.Error(models.ErrMarshal(err, "events response"))
	// 	http.Error(w, models.ErrMarshal(err, "events response").Error(), http.StatusInternalServerError)
	// 	return
	// }
}

// swagger:route GET /api/events/types EventsAPI idGetEventStreamer
// Handle GET request for available event categories and actions.
// responses:
// 200:
func (h *Handler) GetEventTypes(w http.ResponseWriter, req *http.Request, prefObj *models.Preference, user *models.User, provider models.Provider) {
	userID := uuid.FromStringOrNil(user.ID)
	token, _ := req.Context().Value(models.TokenCtxKey).(string)
	eventTypes, err := provider.GetEventTypes(token, userID, *h.SystemID)

	if err != nil {
		http.Error(w, fmt.Errorf("error retrieving event cagegories and actions").Error(), http.StatusInternalServerError)
		return
	}

	err = json.NewEncoder(w).Encode(eventTypes)
	if err != nil {
		h.log.Error(models.ErrMarshal(err, "event types response"))
		http.Error(w, models.ErrMarshal(err, "event types response").Error(), http.StatusInternalServerError)
		return
	}
}

// swagger:route PUT /api/events/status/{id} idGetEventStreamer
// Handle PUT request to update event status.
// Updates event status for the event associated with the id.
// responses:
// 	200: eventResponseWrapper

func (h *Handler) UpdateEventStatus(w http.ResponseWriter, req *http.Request, prefObj *models.Preference, user *models.User, provider models.Provider) {
	eventID := uuid.FromStringOrNil(mux.Vars(req)["id"])
	token, _ := req.Context().Value(models.TokenCtxKey).(string)

	defer func() {
		_ = req.Body.Close()
	}()

	var reqBody map[string]interface{}
	body, err := io.ReadAll(req.Body)
	if err != nil {
		h.log.Error(ErrRequestBody(err))
		http.Error(w, ErrRequestBody(err).Error(), http.StatusInternalServerError)
		return
	}

	_ = json.Unmarshal(body, &reqBody)
	status, ok := reqBody["status"].(string)
	if !ok {
		h.log.Error(ErrUpdateEvent(fmt.Errorf("unable to parse provided event status %s", status), eventID.String()))
		http.Error(w, ErrUpdateEvent(fmt.Errorf("unable to parse provided event status %s", status), eventID.String()).Error(), http.StatusInternalServerError)
		return
	}
	err = provider.UpdateEventStatus(token, eventID, status)
	if err != nil {
		_err := ErrUpdateEvent(err, eventID.String())
		h.log.Error(_err)
		http.Error(w, _err.Error(), http.StatusInternalServerError)
		return
	}

}

// swagger:route PUT /api/events/status idGetEventStreamer
// Handle PUT request to update event status in bulk.
// Bulk update status for the events associated with the ids.
// responses:
//
//	200: eventResponseWrapper
func (h *Handler) BulkUpdateEventStatus(w http.ResponseWriter, req *http.Request, prefObj *models.Preference, user *models.User, provider models.Provider) {

	defer func() {
		_ = req.Body.Close()
	}()

	token, _ := req.Context().Value(models.TokenCtxKey).(string)
	var reqBody eventStatusPayload
	body, err := io.ReadAll(req.Body)
	if err != nil {
		h.log.Error(ErrRequestBody(err))
		http.Error(w, ErrRequestBody(err).Error(), http.StatusInternalServerError)
		return
	}

	_ = json.Unmarshal(body, &reqBody)
	err = provider.BulkUpdateEventStatus(token, reqBody.StatusIDs, reqBody.Status)
	if err != nil {
		_err := ErrBulkUpdateEvent(err)
		h.log.Error(_err)
		http.Error(w, _err.Error(), http.StatusInternalServerError)
		return
	}

}

// swagger:route DELETE /api/events/bulk idGetEventStreamer
// Handle DELETE request to delete events in bulk.
// Bulk delete events associated with the ids.
// responses:
// 	200:

func (h *Handler) BulkDeleteEvent(w http.ResponseWriter, req *http.Request, prefObj *models.Preference, user *models.User, provider models.Provider) {
	defer func() {
		_ = req.Body.Close()
	}()

	token, _ := req.Context().Value(models.TokenCtxKey).(string)
	var reqBody statusIDs
	body, err := io.ReadAll(req.Body)
	if err != nil {
		h.log.Error(ErrRequestBody(err))
		http.Error(w, ErrRequestBody(err).Error(), http.StatusInternalServerError)
		return
	}

	_ = json.Unmarshal(body, &reqBody)
	err = provider.BulkDeleteEvent(token, reqBody.IDs)
	if err != nil {
		_err := ErrBulkDeleteEvent(err)
		h.log.Error(_err)
		http.Error(w, _err.Error(), http.StatusInternalServerError)
		return
	}
}

// swagger:route DELETE /api/events/{id} idGetEventStreamer
// Handle DELETE request for events.
// Deletes event associated with the id.
// responses:
// 	200:

func (h *Handler) DeleteEvent(w http.ResponseWriter, req *http.Request, prefObj *models.Preference, user *models.User, provider models.Provider) {
	eventID := uuid.FromStringOrNil(mux.Vars(req)["id"])
	token, _ := req.Context().Value(models.TokenCtxKey).(string)
	err := provider.DeleteEvent(token, eventID)

	if err != nil {
		_err := ErrDeleteEvent(err, eventID.String())
		h.log.Error(_err)
		http.Error(w, _err.Error(), http.StatusInternalServerError)
		return
	}
}

func getEventFilter(req *http.Request) (*events.EventsFilter, error) {
	urlValues := req.URL.Query()
	category := urlValues.Get("category")
	action := urlValues.Get("action")
	severity := urlValues.Get("severity")
	acted_upon := urlValues.Get("acted_upon")

	eventFilter := &events.EventsFilter{}
	if category != "" {
		err := json.Unmarshal([]byte(category), &eventFilter.Category)
		if err != nil {
			return eventFilter, models.ErrUnmarshal(err, "event category filter")
		}
	}

	if action != "" {
		err := json.Unmarshal([]byte(action), &eventFilter.Action)
		if err != nil {
			return eventFilter, models.ErrUnmarshal(err, "event action filter")
		}
	}

	if severity != "" {
		err := json.Unmarshal([]byte(severity), &eventFilter.Severity)
		if err != nil {
			return eventFilter, models.ErrUnmarshal(err, "event severity filter")
		}
	}

	if acted_upon != "" {
		err := json.Unmarshal([]byte(acted_upon), &eventFilter.ActedUpon)
		if err != nil {
			return eventFilter, models.ErrUnmarshal(err, "event acted upon filter")
		}
	}

	return eventFilter, nil
}

// swagger:route GET /api/events EventsAPI idGetEventStreamer
// Handle GET request for events.
// Listens for events across all of Meshery's components like adapters and server, streaming them to the UI via Server Side Events
// This API call never terminates and establishes a persistent keep-alive connection over which `EventsResponse`s are pushed.
// responses:
// 	200:

// EventStreamHandler endpoint is used for streaming events to the frontend
func (h *Handler) EventStreamHandler(w http.ResponseWriter, req *http.Request, prefObj *models.Preference, user *models.User, p models.Provider) {
	// if req.Method != http.MethodGet {
	// 	w.WriteHeader(http.StatusNotFound)
	// 	return
	// }

	client := "ui"
	if req.URL.Query().Get("client") != "" {
		client = req.URL.Query().Get("client")
	}

	if flusherMap == nil {
		flusherMap = make(map[string]http.Flusher, 0)
	}

	flusher, ok := w.(http.Flusher)
	flusherMap[client] = flusher

	if !ok {
		h.log.Error(ErrEventStreamingNotSupported)
		http.Error(w, "Event streaming is not supported at the moment.", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	notify := req.Context()

	var err error

	localMeshAdapters := map[string]*meshes.MeshClient{}
	localMeshAdaptersLock := &sync.Mutex{}

	respChan := make(chan []byte, 100)

	newAdaptersChan := make(chan *meshes.MeshClient)

	go func() {
		for mClient := range newAdaptersChan {
			h.log.Debug("received a new mesh client, listening for events")
			go func(mClient *meshes.MeshClient) {
				listenForAdapterEvents(req.Context(), mClient, respChan, h.log, p, h.config.EventBroadcaster, *h.SystemID, user.ID)
				_ = mClient.Close()
			}(mClient)
		}

		h.log.Debug("new adapters channel closed")
	}()
	go listenForCoreEvents(req.Context(), h.EventsBuffer, respChan, h.log, p)
	go func(flusher http.Flusher) {
		for data := range respChan {
			h.log.Debug("received new data on response channel")
			_, _ = fmt.Fprintf(w, "data: %s\n\n", data)
			if flusher != nil {
				flusher.Flush()
				h.log.Debug("Flushed the messages on the wire...")
			}
		}
		h.log.Debug("response channel closed")
	}(flusherMap[client])

STOP:
	for {
		select {
		case <-notify.Done():
			h.log.Debug("received signal to close connection and channels")
			close(newAdaptersChan)
			break STOP
		default:
			meshAdapters := prefObj.MeshAdapters
			if meshAdapters == nil {
				meshAdapters = []*models.Adapter{}
			}

			adaptersLen := len(meshAdapters)
			if adaptersLen == 0 {
				// Clear the adapter cache
				localMeshAdapters = closeAdapterConnections(localMeshAdaptersLock, localMeshAdapters)
			} else {
				localMeshAdaptersLock.Lock()
				for _, ma := range meshAdapters {
					mClient, ok := localMeshAdapters[ma.Location]
					if !ok {
						mClient, err = meshes.CreateClient(req.Context(), ma.Location)
						if err == nil {
							localMeshAdapters[ma.Location] = mClient
						}
					}
					if mClient != nil {
						_, err = mClient.MClient.MeshName(req.Context(), &meshes.MeshNameRequest{})
						if err != nil {
							_ = mClient.Close()
							delete(localMeshAdapters, ma.Location)
						} else {
							if !ok { // reusing the map check, only when ok is false a new entry will be added
								newAdaptersChan <- mClient
							}
						}
					}
				}
				localMeshAdaptersLock.Unlock()
			}
		}
		time.Sleep(5 * time.Second)
	}
	close(respChan)
	defer h.log.Debug("events handler closed")
}
func listenForCoreEvents(ctx context.Context, eb *_events.EventStreamer, resp chan []byte, log logger.Handler, _ models.Provider) {
	datach := make(chan interface{}, 10)
	go eb.Subscribe(datach)
	for {
		select {
		case datap := <-datach:
			event, ok := datap.(*meshes.EventsResponse)
			if !ok {
				continue
			}
			data, err := json.Marshal(event)
			if err != nil {
				log.Error(models.ErrMarshal(err, "event"))
				continue
			}
			resp <- data

		case <-ctx.Done():
			return
		}
	}
}
func listenForAdapterEvents(ctx context.Context, mClient *meshes.MeshClient, respChan chan []byte, log logger.Handler, p models.Provider, ec *models.Broadcast, systemID uuid.UUID, userID string) {
	log.Debug("Received a stream client...")
	userUUID := uuid.FromStringOrNil(userID)
	streamClient, err := mClient.MClient.StreamEvents(ctx, &meshes.EventsRequest{})
	if err != nil {
		log.Error(ErrStreamEvents(err))
		// errChan <- err
		// http.Error(w, "There was an error connecting to the backend to get events", http.StatusInternalServerError)
		return
	}

	for {
		log.Debug("Waiting to receive events.")
		event, err := streamClient.Recv()
		if err != nil {
			if err == io.EOF {
				log.Error(ErrStreamClient(err))
				return
			}
			log.Error(ErrStreamClient(err))
			return
		}
		// log.Debugf("received an event: %+#v", event)
		log.Debug("Received an event.")
		eventType := event.EventType.String()
		eventBuilder := events.NewEvent().FromSystem(uuid.FromStringOrNil(event.Component)).
			WithSeverity(events.Informational).WithDescription(event.Summary).WithCategory(event.ComponentName).WithAction("deploy").FromUser(userUUID)
		if strings.Contains(event.Summary, "removed") {
			eventBuilder.WithAction("undeploy")
		}

		if eventType == "ERROR" {
			err := errors.New(event.ErrorCode, errors.Alert, []string{event.Summary}, []string{event.Details}, []string{event.ProbableCause}, []string{event.SuggestedRemediation})
			eventBuilder.WithMetadata(map[string]interface{}{
				"error": err,
			})
		}

		_event := eventBuilder.Build()
		_ = p.PersistEvent(*_event, nil)
		ec.Publish(userUUID, _event)

		data, err := json.Marshal(event)
		if err != nil {
			log.Error(models.ErrMarshal(err, "event"))
			return
		}
		respChan <- data
	}
}

func closeAdapterConnections(localMeshAdaptersLock *sync.Mutex, localMeshAdapters map[string]*meshes.MeshClient) map[string]*meshes.MeshClient {
	localMeshAdaptersLock.Lock()
	for _, mcl := range localMeshAdapters {
		_ = mcl.Close()
	}
	localMeshAdaptersLock.Unlock()

	return map[string]*meshes.MeshClient{}
}

// swagger:route POST /api/events EventsAPI idClientEventHandler
// Receives client-generated events bound for the Notification Center.
// responses:
// 200:

func (h *Handler) ClientEventHandler(w http.ResponseWriter, req *http.Request, prefObj *models.Preference, user *models.User, provider models.Provider) {
	userID := uuid.FromStringOrNil(user.ID)

	defer func() {
		_ = req.Body.Close()
	}()

	var evt events.Event
	body, err := io.ReadAll(req.Body)
	if err != nil {
		h.log.Error(ErrRequestBody(err))
		http.Error(w, ErrRequestBody(err).Error(), http.StatusInternalServerError)
		return
	}

	err = json.Unmarshal(body, &evt)
	if err != nil {
		h.log.Error(models.ErrUnmarshal(err, "event"))
		http.Error(w, models.ErrUnmarshal(err, "event").Error(), http.StatusInternalServerError)
		return
	}

	if evt.ActedUpon.IsNil() || evt.Action == "" || evt.Category == "" || evt.Severity == "" {
		h.log.Error(models.ErrInvalidEventData())
		http.Error(w, models.ErrInvalidEventData().Error(), http.StatusBadRequest)
		return
	}

	eventBuilder := events.NewEvent().FromUser(userID).FromSystem(*h.SystemID).
		WithCategory(evt.Category).WithAction(evt.Action).WithSeverity(events.EventSeverity(evt.Severity)).
		WithDescription(evt.Description).WithMetadata(evt.Metadata).ActedUpon(evt.ActedUpon)

	event := eventBuilder.Build()
	err = provider.PersistEvent(*event, nil)
	if err != nil {
		h.log.Error(models.ErrPersistEvent(err))
		http.Error(w, models.ErrPersistEvent(err).Error(), http.StatusInternalServerError)
		return

	}
	go h.config.EventBroadcaster.Publish(userID, event)

	w.WriteHeader(http.StatusCreated)
	err = json.NewEncoder(w).Encode(event)
	if err != nil {
		h.log.Error(models.ErrMarshal(err, "event response"))
		http.Error(w, models.ErrMarshal(err, "event response").Error(), http.StatusInternalServerError)
		return
	}
}
