// Music Collection Manager Web Interface - Main JavaScript

// SSE connection management
class SSEClient {
    constructor() {
        this.connections = new Map();
    }

    connectTask(taskId, onMessage) {
        if (this.connections.has(taskId)) {
            return;
        }

        const eventSource = new EventSource(`/api/v1/tasks/${taskId}/stream`);

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            onMessage(data);
        };

        eventSource.addEventListener('progress', (event) => {
            const data = JSON.parse(event.data);
            onMessage({ type: 'progress', ...data });
        });

        eventSource.addEventListener('log', (event) => {
            const data = JSON.parse(event.data);
            onMessage({ type: 'log', ...data });
        });

        eventSource.addEventListener('input_required', (event) => {
            const data = JSON.parse(event.data);
            onMessage({ type: 'input_required', ...data });
        });

        eventSource.addEventListener('completed', (event) => {
            const data = JSON.parse(event.data);
            onMessage({ type: 'completed', ...data });
            this.disconnect(taskId);
        });

        eventSource.addEventListener('failed', (event) => {
            const data = JSON.parse(event.data);
            onMessage({ type: 'failed', ...data });
            this.disconnect(taskId);
        });

        eventSource.addEventListener('cancelled', (event) => {
            const data = JSON.parse(event.data);
            onMessage({ type: 'cancelled', ...data });
            this.disconnect(taskId);
        });

        eventSource.onerror = () => {
            console.error('SSE connection error for task:', taskId);
            this.disconnect(taskId);
        };

        this.connections.set(taskId, eventSource);
    }

    connectGlobal(onMessage) {
        if (this.connections.has('global')) {
            return;
        }

        const eventSource = new EventSource('/api/v1/tasks/stream/global');

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            onMessage(data);
        };

        eventSource.onerror = () => {
            console.error('Global SSE connection error');
            setTimeout(() => this.connectGlobal(onMessage), 5000);
        };

        this.connections.set('global', eventSource);
    }

    disconnect(taskId) {
        const eventSource = this.connections.get(taskId);
        if (eventSource) {
            eventSource.close();
            this.connections.delete(taskId);
        }
    }

    disconnectAll() {
        for (const [id, eventSource] of this.connections) {
            eventSource.close();
        }
        this.connections.clear();
    }
}

// Global SSE client instance
window.sseClient = new SSEClient();

// Alpine.js data stores
document.addEventListener('alpine:init', () => {
    // Task store
    Alpine.store('tasks', {
        items: [],
        loading: false,

        async fetch() {
            this.loading = true;
            try {
                const response = await fetch('/api/v1/tasks');
                const data = await response.json();
                this.items = data.tasks;
            } catch (error) {
                console.error('Failed to fetch tasks:', error);
            }
            this.loading = false;
        },

        getActive() {
            return this.items.filter(t =>
                t.status === 'pending' || t.status === 'running' || t.status === 'awaiting_input'
            );
        }
    });

    // Status store
    Alpine.store('status', {
        data: null,
        loading: false,

        async fetch() {
            this.loading = true;
            try {
                const response = await fetch('/api/v1/status');
                this.data = await response.json();
            } catch (error) {
                console.error('Failed to fetch status:', error);
            }
            this.loading = false;
        }
    });
});

// Utility functions
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
}

function formatProgress(progress) {
    return Math.round(progress) + '%';
}

function getStatusBadgeClass(status) {
    const classes = {
        'pending': 'bg-yellow-100 text-yellow-800',
        'running': 'bg-blue-100 text-blue-800',
        'awaiting_input': 'bg-purple-100 text-purple-800',
        'completed': 'bg-green-100 text-green-800',
        'failed': 'bg-red-100 text-red-800',
        'cancelled': 'bg-gray-100 text-gray-800',
    };
    return classes[status] || 'bg-gray-100 text-gray-800';
}

function getServiceBadgeClass(configured, connected) {
    if (!configured) return 'bg-yellow-100 text-yellow-800';
    if (connected) return 'bg-green-100 text-green-800';
    return 'bg-red-100 text-red-800';
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const bgColors = {
        'info': 'bg-blue-500',
        'success': 'bg-green-500',
        'warning': 'bg-yellow-500',
        'error': 'bg-red-500',
    };

    toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg text-white ${bgColors[type]} shadow-lg z-50 animate-fade-in`;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('animate-fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Initialize htmx extensions
document.body.addEventListener('htmx:afterRequest', function(event) {
    if (event.detail.failed) {
        showToast('Request failed. Please try again.', 'error');
    }
});

// Interactive modal handling
function showInteractiveModal(taskId, prompt, options) {
    const modal = document.getElementById('interactive-modal');
    const promptEl = document.getElementById('modal-prompt');
    const optionsEl = document.getElementById('modal-options');

    promptEl.textContent = prompt;
    optionsEl.innerHTML = '';

    options.forEach((option, index) => {
        const card = document.createElement('div');
        card.className = 'option-card p-4 border rounded-lg mb-2 flex items-center gap-4';
        card.innerHTML = `
            ${option.artwork_url ? `<img src="${option.artwork_url}" class="w-16 h-16 rounded object-cover">` : ''}
            <div class="flex-1">
                <div class="font-medium">${option.title || option.name}</div>
                <div class="text-sm text-gray-500">${option.artist || ''} ${option.year ? `(${option.year})` : ''}</div>
            </div>
            <button class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    onclick="submitInteractiveResponse('${taskId}', ${index + 1})">
                Select
            </button>
        `;
        optionsEl.appendChild(card);
    });

    // Add skip option
    const skipCard = document.createElement('div');
    skipCard.className = 'option-card p-4 border rounded-lg mb-2';
    skipCard.innerHTML = `
        <button class="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                onclick="submitInteractiveResponse('${taskId}', 0)">
            Skip this service
        </button>
    `;
    optionsEl.appendChild(skipCard);

    modal.classList.remove('hidden');
}

function hideInteractiveModal() {
    const modal = document.getElementById('interactive-modal');
    modal.classList.add('hidden');
}

async function submitInteractiveResponse(taskId, selection) {
    try {
        const response = await fetch(`/api/v1/tasks/${taskId}/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selection })
        });

        if (response.ok) {
            hideInteractiveModal();
            showToast('Response submitted', 'success');
        } else {
            showToast('Failed to submit response', 'error');
        }
    } catch (error) {
        console.error('Failed to submit response:', error);
        showToast('Failed to submit response', 'error');
    }
}

// Cancel task
async function cancelTask(taskId) {
    if (!confirm('Are you sure you want to cancel this task?')) return;

    try {
        const response = await fetch(`/api/v1/tasks/${taskId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('Task cancelled', 'success');
            location.reload();
        } else {
            showToast('Failed to cancel task', 'error');
        }
    } catch (error) {
        console.error('Failed to cancel task:', error);
        showToast('Failed to cancel task', 'error');
    }
}
