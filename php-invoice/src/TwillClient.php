<?php

declare(strict_types=1);

namespace TwillDocs\Example;

use RuntimeException;

/**
 * A tiny, dependency-free client for the Twill Docs API.
 *
 * Uses only ext-curl (bundled with standard PHP) so this example runs with no
 * `composer install` step. In a real project you'd likely use Guzzle or your
 * framework's HTTP client, but the request shapes are identical.
 */
final class TwillClient
{
    private string $baseUrl;

    public function __construct(
        private string $apiKey,
        string $baseUrl = 'https://www.twilldocs.com',
    ) {
        $this->baseUrl = rtrim($baseUrl, '/');
    }

    /**
     * Create a document from a template. Twill validates the input against the
     * template's schema, then renders the PDF asynchronously — this returns
     * immediately (HTTP 202) with the new document's id and status.
     *
     * The Idempotency-Key makes a retried request safe: Twill returns the
     * original document instead of rendering (and billing) a duplicate.
     *
     * @param  array<string,mixed>  $input
     * @return array{id:int,status:string}
     */
    public function createDocument(string $template, array $input, ?string $idempotencyKey = null): array
    {
        $idempotencyKey ??= bin2hex(random_bytes(16));

        $body = json_encode(['template' => $template, 'input' => $input], JSON_THROW_ON_ERROR);

        /** @var array{id:int,status:string} $decoded */
        $decoded = $this->requestJson('POST', '/v1/documents', $body, [
            'Content-Type: application/json',
            'Idempotency-Key: ' . $idempotencyKey,
        ]);

        return $decoded;
    }

    /**
     * @return array{id:int,status:string,error?:?string,created_at?:string}
     */
    public function getDocument(int $id): array
    {
        /** @var array{id:int,status:string,error?:?string,created_at?:string} $decoded */
        $decoded = $this->requestJson('GET', "/v1/documents/{$id}");

        return $decoded;
    }

    /**
     * Poll until the render finishes. Rendering an invoice is quick, so a short
     * interval with a generous ceiling is plenty.
     *
     * @return array{id:int,status:string,error?:?string,created_at?:string}
     */
    public function waitForDocument(int $id, int $timeoutSeconds = 60, int $intervalSeconds = 1): array
    {
        $deadline = time() + $timeoutSeconds;

        while (time() < $deadline) {
            $doc = $this->getDocument($id);
            $status = $doc['status'] ?? 'unknown';

            if ($status === 'succeeded') {
                return $doc;
            }
            if ($status === 'failed') {
                throw new RuntimeException("Render failed for document {$id}: " . ($doc['error'] ?? 'unknown error'));
            }
            sleep($intervalSeconds);
        }

        throw new RuntimeException("Timed out waiting for document {$id} to render.");
    }

    /** Download the finished PDF bytes. Only valid once the document has succeeded. */
    public function downloadPdf(int $id): string
    {
        return $this->request('GET', "/v1/documents/{$id}/download");
    }

    /**
     * @param  list<string>  $extraHeaders
     * @return array<string,mixed>
     */
    private function requestJson(string $method, string $path, ?string $body = null, array $extraHeaders = []): array
    {
        $raw = $this->request($method, $path, $body, $extraHeaders);

        /** @var array<string,mixed> $decoded */
        $decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);

        return $decoded;
    }

    /**
     * @param  list<string>  $extraHeaders
     */
    private function request(string $method, string $path, ?string $body = null, array $extraHeaders = []): string
    {
        if ($this->apiKey === '') {
            throw new RuntimeException('TWILL_API_KEY is not set. Copy .env.example to .env and fill it in.');
        }

        $ch = curl_init($this->baseUrl . $path);
        if ($ch === false) {
            throw new RuntimeException('Failed to initialize a curl handle.');
        }

        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_HTTPHEADER => array_merge([
                'Authorization: Bearer ' . $this->apiKey,
                'Accept: application/json',
            ], $extraHeaders),
        ]);

        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }

        $response = curl_exec($ch);
        if ($response === false) {
            $error = curl_error($ch);
            curl_close($ch);
            throw new RuntimeException("Request to {$path} failed: {$error}");
        }

        $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        if ($status < 200 || $status >= 300) {
            throw new RuntimeException("Request to {$path} failed: HTTP {$status} — " . (string) $response);
        }

        return (string) $response;
    }
}
