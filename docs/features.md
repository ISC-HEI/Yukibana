# Yukibana Features <!-- omit from toc -->

This document lists most custom features implemented in Yukibana and where
their implementations are located.

<details>
<summary><strong>Table of Contents</strong></summary>

- [Configuration](#configuration)
- [Contribution disabling](#contribution-disabling)
- [Widgets cleanup](#widgets-cleanup)
- [Plugin tabs cleanup](#plugin-tabs-cleanup)
- [Toolbar setup](#toolbar-setup)
- [Initial layout definition](#initial-layout-definition)
- [Inline suggestions disabling](#inline-suggestions-disabling)
- [Squiggles disabling](#squiggles-disabling)
- [AI Chatbot disabling](#ai-chatbot-disabling)
- [Submission](#submission)
- [Readonly files](#readonly-files)
- [Assignment panel](#assignment-panel)
- [Cloud login and submission](#cloud-login-and-submission)
- [Open project via custom URI](#open-project-via-custom-uri)
- [Telemetry](#telemetry)
- [Notification cleanup](#notification-cleanup)

</details>

## Configuration

Yukibana handles configuration by loading it from a file in the current workspace.
The configuration model is defined using [`zod`](https://zod.dev/) in [yukibana/src/common/yukibana-config.ts](../theia-extensions/yukibana/src/common/yukibana-config.ts).
It is loaded by the `ConfigProvider` which can be injected in other contributions
and services. `ConfigProvider` is defined in [yukibana/src/browser/config/config-provider.ts](../theia-extensions/yukibana/src/browser/config/config-provider.ts)
and makes use of Monaco's document model to load the file and track changes
for hot-reload.

## Contribution disabling

Some contributions from other extensions and plugins are completely disabled.
This is done using a `FilterContribution` in [yukibana/src/browser/yukibana-filter-contribution.ts](../theia-extensions/yukibana/src/browser/yukibana-filter-contribution.ts).

Currently only the terminal is fully disabled.

## Widgets cleanup

Some widgets are removed from the interface after initialization, such as
the terminal tab. This is done by `CleanupFrontendContribution` in [yukibana/src/browser/yukibana-cleanup-contribution.ts](../theia-extensions/yukibana/src/browser/yukibana-cleanup-contribution.ts).

## Plugin tabs cleanup

To unclutter the initial layout, plugin views are filtered upon registration.
This process happens in `YukibanaPluginViewRegistry` in [yukibana/src/browser/yukibana-plugin-view-registry.ts](../theia-extensions/yukibana/src/browser/yukibana-plugin-view-registry.ts).

Views and containers can thus be toggled through the configuration file.

## Toolbar setup

A custom toolbar is defined in [yukibana/src/browser/yukibana-toolbar-contribution.ts](../theia-extensions/yukibana/src/browser/yukibana-toolbar-contribution.ts).

## Initial layout definition

The initial layout for when a workspace is opened is controlled by `YukibanaLayoutContribution`
in [yukibana/src/browser/yukibana-toolbar-contribution.ts](../theia-extensions/yukibana/src/browser/yukibana-toolbar-contribution.ts).

Additionally, we define a custom layout restorer to always start with
the configured initial layout. When initialized, the module also rebinds layout
initialization methods defined by other extensions to prevent them from adding and
opening tabs.

The default tabs added to the sidebars are configurable throught the config file
thanks to `TOGGLEABLE_WIDGETS` which maps frontend contributions
to configuration keys.

## Inline suggestions disabling

Inline suggestions are toggled by conditionally dropping completion item provider
registration requests, in [yukibana/src/browser/yukibana-suggestions-contribution.ts](../theia-extensions/yukibana/src/browser/yukibana-suggestions-contribution.ts).

> [!NOTE]
> This could be improved by wrapping the providers methods instead to allow
> hot-reloading by checking the configuration lazily only when completion is requested.

## Squiggles disabling

To disable "squiggles", i.e. problem markers, we rebind the `ProblemManager` service
to our own, which can be toggled to clear all markers depending on the configuration.
This custom service is defined in [yukibana/src/browser/yukibana-problem-manager.ts](../theia-extensions/yukibana/src/browser/yukibana-problem-manager.ts)

## AI Chatbot disabling

AI features can be completely toggled by `YukibanaAIIdeActivationService` in [yukibana/src/browser/yukibana-ai-ide-activation-service.ts](../theia-extensions/yukibana/src/browser/yukibana-ai-ide-activation-service.ts)
which rebinds the default implementation to override the user's setting with
the config's value.

## Submission

To submit an assignment, we implement both a frontend contribution
to provide a command, and a backend contribution to perform the actual
file processing and upload.

This is implemented in a dedicated `yukibana-submission` extension.
The frontend contribution is defined in [yukibana-submission/src/browser/submission-frontend-contribution.ts](../theia-extensions/yukibana-submission/src/browser/submission-frontend-contribution.ts).
The backend service is defined in [yukibana-submission/src/node/submission-service.ts](../theia-extensions/yukibana-submission/src/node/submission-service.ts).

The two communicate through JSON-Rpc, as set up in [yukibana-submission/src/node/submission-backend-module.ts](../theia-extensions/yukibana-submission/src/node/submission-backend-module.ts)
and [yukibana-submission/src/browser/submission-fronted-module.ts](../theia-extensions/yukibana-submission/src/browser/submission-fronted-module.ts).

Additionally, translations for the action and feedback message are provided by
a `LocalizationContribution` in [yukibana-submission/src/node/submission-localization-contribution.ts](../theia-extensions/yukibana-submission/src/node/submission-localization-contribution.ts).
Translations are defined in [yukibana-submission/i18n/](../theia-extensions/yukibana-submission/i18n/).

The extension defines a simple `FileSubmissionTarget` interface in [yukibana-submission/src/common/submission-target.ts](../theia-extensions/yukibana-submission/src/common/submission-target.ts).

This lets other extensions (such as `yukibana-cloud`) define their own submission
targets and register them as contributions. Then a setting in the config file
lets the teacher select how the assignment should be submitted (e.g. via the cloud
registry, a GitHub repository, a file sent by mail or uploaded on Moodle).

## Readonly files

Some files can be configured to open in readonly mode. This feature is purely UX
because as long as the files are on the student's device, they will be able
to modify them. A hard check shall be implemented in the backend to verify
that submitted files respect this parameter.

For this feature, we implement a custom `YukibanaRemoteFileSystemProvider` in [yukibana/src/browser/yukibana-remote-file-system-provider.ts](../theia-extensions/yukibana/src/browser/yukibana-remote-file-system-provider.ts)
and rebind the default `RemoteFileSystemProvider`. Our custom provider prepends
file accesses with a check to see whether the files are defined as readonly.

## Assignment panel

A default markdown assignment description can be automatically shown through
the assignment panel. This widget is implemented in [theia-extensions/yukibana/src/browser/assignment/assignment-pane-widget.ts](../theia-extensions/yukibana/src/browser/assignment/assignment-pane-widget.ts).

A simple `AssignmentResolver` provides a dynamic URI to the assignment file,
in [theia-extensions/yukibana/src/browser/assignment/assignment-resolver.ts](../theia-extensions/yukibana/src/browser/assignment/assignment-resolver.ts).

## Cloud login and submission

The `yukibana-cloud` extension implements a bridge with the cloud registry.
It adds commands to log in and out of the registry, and registers
a `FileSubmissionTarget` in [yukibana-cloud/src/browser/cloud-submission-target.ts](../theia-extensions/yukibana-cloud/src/browser/cloud-submission-target.ts)
(see [Submission](#submission)).

## Open project via custom URI

A custom URI handler is implemented in [yukibana-cloud/src/browser/yukibana-url-handler.ts](../theia-extensions/yukibana-cloud/src/browser/yukibana-url-handler.ts).

It handles `yukibana://` URIs, and more specifically, those of the form `yukibana://project/open?id=<project-uuid>`.
When such an URI is opened, the user is asked to choose a destination directory.
Then the starter archive is fetched from the registry and extracted. Finally,
the project is opened in the current or a new window, as chosen by the user.

## Telemetry

A standalone `yukibana-telemetry` extension provides a dedicated
telemetry sink in [yukibana-telemetry/src/node/yukibana-telemetry-sink.ts](../theia-extensions/yukibana-telemetry/src/node/yukibana-telemetry-sink.ts).

It collects telemetry report sent to topics starting with `yukibana/`,
batches them (count and timeout limits), and sends them to a server. At the moment,
the server's address is hardcoded to a localhost endpoint.

Examples of telemetry reporting can be found in [yukibana-cloud/src/browser/yukibana-url-handler.ts](../theia-extensions/yukibana-cloud/src/browser/yukibana-url-handler.ts)
and [yukibana-submission/src/browser/submission-frontend-contribution.ts](../theia-extensions/yukibana-submission/src/browser/submission-frontend-contribution.ts).

## Notification cleanup

To ignore specific notifications, we may not always be able to disable them
at the root (in the emitter), because they may come from external extensions.

Instead, we rebind the `MessageService` to a custom implementation in [yukibana/src/common/yukibana-message-service.ts](../theia-extensions/yukibana/src/common/yukibana-message-service.ts).
This custom service can ignore notifications and auto-select actions
without showing the choices to the user.
