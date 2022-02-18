package util

import (
	"sync"
	"sync/atomic"
	"time"

	"github.com/flutter-webrtc/flutter-webrtc-server/pkg/logger"
)

type val struct {
	data        interface{}
	expiredTime int64
}

const delChannelCap = 100

type ExpiredMap struct {
	m        map[interface{}]*val
	timeMap  map[int64][]interface{}
	lck      *sync.Mutex
	stop     chan struct{}
	needStop int32
}

func NewExpiredMap() *ExpiredMap {
	e := ExpiredMap{
		m:       make(map[interface{}]*val),
		lck:     new(sync.Mutex),
		timeMap: make(map[int64][]interface{}),
		stop:    make(chan struct{}),
	}
	atomic.StoreInt32(&e.needStop, 0)
	go e.run(time.Now().Unix())
	return &e
}

type delMsg struct {
	keys []interface{}
	t    int64
}

func (e *ExpiredMap) run(now int64) {
	t := time.NewTicker(time.Second * 1)
	delCh := make(chan *delMsg, delChannelCap)
	go func() {
		for v := range delCh {
			if atomic.LoadInt32(&e.needStop) == 1 {
				logger.Infof("---del stop---")
				return
			}
			e.multiDelete(v.keys, v.t)
		}
	}()
	for {
		select {
		case <-t.C:
			now++
			if keys, found := e.timeMap[now]; found {
				delCh <- &delMsg{keys: keys, t: now}
			}
		case <-e.stop:
			logger.Infof("=== STOP ===")
			atomic.StoreInt32(&e.needStop, 1)
			delCh <- &delMsg{keys: []interface{}{}, t: 0}
			return
		}
	}
}

func (e *ExpiredMap) Set(key, value interface{}, expireSeconds int64) {
	if expireSeconds <= 0 {
		return
	}
	logger.Debugf("ExpiredMap: Set %s ttl[%d] => %v", key, expireSeconds, value)
	e.lck.Lock()
	defer e.lck.Unlock()
	expiredTime := time.Now().Unix() + expireSeconds
	e.m[key] = &val{
		data:        value,
		expiredTime: expiredTime,
	}
	e.timeMap[expiredTime] = append(e.timeMap[expiredTime], key)
}

func (e *ExpiredMap) Get(key interface{}) (found bool, value interface{}) {
	e.lck.Lock()
	defer e.lck.Unlock()
	if found = e.checkDeleteKey(key); !found {
		return
	}
	value = e.m[key].data
	return
}

func (e *ExpiredMap) Delete(key interface{}) {
	e.lck.Lock()
	delete(e.m, key)
	e.lck.Unlock()
}

func (e *ExpiredMap) Remove(key interface{}) {
	e.Delete(key)
}

func (e *ExpiredMap) multiDelete(keys []interface{}, t int64) {
	e.lck.Lock()
	defer e.lck.Unlock()
	delete(e.timeMap, t)
	for _, key := range keys {
		delete(e.m, key)
	}
}

func (e *ExpiredMap) Length() int {
	e.lck.Lock()
	defer e.lck.Unlock()
	return len(e.m)
}

func (e *ExpiredMap) Size() int {
	return e.Length()
}

func (e *ExpiredMap) TTL(key interface{}) int64 {
	e.lck.Lock()
	defer e.lck.Unlock()
	if !e.checkDeleteKey(key) {
		return -1
	}
	return e.m[key].expiredTime - time.Now().Unix()
}

func (e *ExpiredMap) Clear() {
	e.lck.Lock()
	defer e.lck.Unlock()
	e.m = make(map[interface{}]*val)
	e.timeMap = make(map[int64][]interface{})
}

func (e *ExpiredMap) Close() {
	e.lck.Lock()
	defer e.lck.Unlock()
	e.stop <- struct{}{}
}

func (e *ExpiredMap) Stop() {
	e.Close()
}

func (e *ExpiredMap) DoForEach(handler func(interface{}, interface{})) {
	e.lck.Lock()
	defer e.lck.Unlock()
	for k, v := range e.m {
		if !e.checkDeleteKey(k) {
			continue
		}
		handler(k, v)
	}
}

func (e *ExpiredMap) DoForEachWithBreak(handler func(interface{}, interface{}) bool) {
	e.lck.Lock()
	defer e.lck.Unlock()
	for k, v := range e.m {
		if !e.checkDeleteKey(k) {
			continue
		}
		if handler(k, v) {
			break
		}
	}
}

func (e *ExpiredMap) checkDeleteKey(key interface{}) bool {
	if val, found := e.m[key]; found {
		if val.expiredTime <= time.Now().Unix() {
			delete(e.m, key)
			return false
		}
		return true
	}
	return false
}
