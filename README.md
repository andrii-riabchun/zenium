# Zenium

Zenium is a Chrome extension built with Vite and CRXJS.

## GitHub Actions

The `Extension CI` workflow runs on pushes to `main`, pull requests, and manual dispatches. The build job always creates a `zenium-<version>.zip` artifact with the extension files at the archive root.

On manual runs, `publish_mode` controls whether a second release job uploads that package to the Chrome Web Store:

- `no_upload`: build the zip artifact only
- `upload_only`: upload a new package draft only
- `default_publish`: upload and submit for review with automatic publish after approval
- `staged_publish`: upload and submit for review, then leave the approved package staged for manual publish

The release job only runs for manual dispatches when `publish_mode` is not `no_upload`.

Chrome Web Store uploads use a zip package. A `.crx` package is only needed if you later opt into Verified CRX Uploads.

## Chrome Web Store setup

The release workflow expects an existing Chrome Web Store item. For the first release, create the listing in the Chrome Web Store dashboard and upload the first package manually.

After the initial listing exists:

1. Create a Google Cloud project and enable the Chrome Web Store API.
2. Create a service account in that project.
3. Add the service account email to the Chrome Web Store Developer Dashboard in the `Account` section.
4. Add these GitHub repository secrets:

- `CWS_ITEM_ID`
- `CWS_PUBLISHER_ID`
- `CWS_SERVICE_ACCOUNT_KEY_JSON`

`CWS_SERVICE_ACCOUNT_KEY_JSON` should contain the raw JSON credentials for the service account key.
