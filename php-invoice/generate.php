<?php

declare(strict_types=1);

use TwillDocs\Example\TwillClient;

// Works whether or not you ran `composer install` — this example has no
// runtime dependencies, so it loads the client directly if there's no autoloader.
$autoload = __DIR__ . '/vendor/autoload.php';
if (is_file($autoload)) {
    require $autoload;
} else {
    require __DIR__ . '/src/TwillClient.php';
}

// --- tiny .env loader (no dependencies) -------------------------------------
$envPath = __DIR__ . '/.env';
if (is_file($envPath)) {
    foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (str_starts_with(trim($line), '#') || !str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        if ($key !== '' && getenv($key) === false) {
            putenv($key . '=' . trim($value));
        }
    }
}

$apiKey = getenv('TWILL_API_KEY') ?: '';
if ($apiKey === '') {
    fwrite(STDERR, "TWILL_API_KEY is not set. Copy .env.example to .env and fill it in.\n");
    exit(1);
}
$baseUrl = getenv('TWILL_BASE_URL') ?: 'https://www.twilldocs.com';

$client = new TwillClient($apiKey, $baseUrl);

// --- your structured invoice data -------------------------------------------
// In a real app this comes from your database / billing system. Notice there
// are no subtotal/tax/total fields: you supply line items and the tax rate, and
// Twill computes every monetary total server-side.
$invoice = [
    'invoice_number' => 'INV-1001',
    'issue_date' => date('Y-m-d'),
    'due_date' => date('Y-m-d', strtotime('+30 days')),
    'currency' => 'USD',
    'seller' => [
        'name' => 'Northwind Studio',
        'address' => '500 Market St, San Francisco, CA',
        'email' => 'billing@northwind.example',
        'tax_id' => 'US123456789',
    ],
    'buyer' => [
        'name' => 'Acme Corp',
        'address' => '1 Infinite Loop, Cupertino, CA',
        'email' => 'ap@acme.example',
    ],
    'line_items' => [
        ['description' => 'Consulting — implementation', 'quantity' => 3, 'unit_price' => 1200],
        ['description' => 'Travel expenses', 'quantity' => 1, 'unit_price' => 340],
    ],
    'tax_rate' => 0.085,
    'notes' => 'Payment due within 30 days. Thank you for your business.',
];

try {
    echo "📤 Creating invoice document…\n";
    $created = $client->createDocument('invoice', $invoice);
    $id = $created['id'];
    echo "   Document #{$id} queued (status: {$created['status']})\n";

    echo "⏳ Waiting for the render…\n";
    $client->waitForDocument($id);
    echo "   Render succeeded ✅\n";

    $pdf = $client->downloadPdf($id);

    $outDir = __DIR__ . '/out';
    if (!is_dir($outDir)) {
        mkdir($outDir, 0755, true);
    }
    $outPath = $outDir . "/invoice-{$id}.pdf";
    file_put_contents($outPath, $pdf);

    printf("\n🎉 Done — invoice saved to %s (%.1f KB)\n", $outPath, strlen($pdf) / 1024);
} catch (\Throwable $e) {
    fwrite(STDERR, "\n💥 " . $e->getMessage() . "\n");
    exit(1);
}
