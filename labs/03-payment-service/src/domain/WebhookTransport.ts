export interface WebhookEvent {
    id: string;
    type: string;
    payload: any;
    timestamp: number;
}

export interface WebhookDeliveryResult {
    success: boolean;
    statusCode?: number;
    error?: string;
}

export interface WebhookTransport {
    send(url: string, event: WebhookEvent): Promise<WebhookDeliveryResult>;
}

export class MemoryWebhookTransport implements WebhookTransport {
    public delivered: Array<{url: string; event: WebhookEvent}> = [];

    async send(url: string, event: WebhookEvent): Promise<WebhookDeliveryResult> {
        this.delivered.push({ url, event });
        return { success: true, statusCode: 200 };
    }
}

export class FetchWebhookTransport implements WebhookTransport {
    async send(url: string, event: WebhookEvent): Promise<WebhookDeliveryResult> {
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(event)
            });
            return {
                success: response.ok,
                statusCode: response.status
            };
        } catch (err: any) {
            return {
                success: false,
                error: err.message
            };
        }
    }
}
