/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * EventDispatcher that can count event listeners.
 */
export class SimpleEventDispatcher<EventMap extends object> {
    private m_listeners = new Map<keyof EventMap, Array<(event: any) => void>>();

    addEventListener<E extends keyof EventMap>(
        eventName: E,
        listener: (event: EventMap[E]) => void
    ) {
        let listenerList = this.m_listeners.get(eventName);
        if (listenerList === undefined) {
            listenerList = [];
            this.m_listeners.set(eventName, listenerList);
        }
        listenerList.push(listener);
    }

    removeEventListener<E extends keyof EventMap>(
        eventName: E,
        listener: (event: EventMap[E]) => void
    ) {
        let listenerList = this.m_listeners.get(eventName);
        if (listenerList === undefined) {
            return;
        }
        listenerList = listenerList.filter(existingListener => existingListener !== listener);
        this.m_listeners.set(eventName, listenerList);
    }

    dispatchEvent<E extends keyof EventMap>(eventName: E, event: EventMap[E]) {
        const listenerList = this.m_listeners.get(eventName);
        if (listenerList === undefined) {
            return;
        }
        listenerList.forEach(listener => {
            listener(event);
        });
    }

    listenerCount(eventName: keyof EventMap) {
        const listenerList = this.m_listeners.get(eventName);
        if (listenerList === undefined) {
            return 0;
        }
        return listenerList.length;
    }
}
