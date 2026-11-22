# JaDarsi

**JaDarsi** is a Persian-language educational web application designed to provide an interactive learning experience through a clean, responsive, and user-friendly interface.

The application is built with React, TypeScript, and Vite, with support for local execution and offline usage.

## Features

- Persian language interface with RTL layout
- Responsive design for desktop, tablet, and mobile
- Light and dark themes
- Locally bundled fonts
- Local browser storage for user preferences and learning data
- Offline-capable production build
- Interactive educational components

## Technology Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- Lucide React

## Requirements

- Node.js
- npm

## Installation

Clone the repository:

```bash
git clone https://github.com/ANewHope2005/JaDarsi.git
cd JaDarsi
```

Install dependencies:

```bash
npm install
```

## Development

Start the development server:

```bash
npm run dev
```

Open the local URL displayed in the terminal.

## Production Build

Build the application:

```bash
npm run build
```

The optimized production files will be generated in the `dist/` directory.

To preview the production build locally:

```bash
npm run preview
```

## Offline Usage

JaDarsi includes locally bundled fonts and does not rely on external font CDNs.

After installing dependencies and generating the production build, the application can run locally without an internet connection.

To use the application offline, run the production preview server and open the local address provided by Vite.

**Note:** Installing dependencies and downloading the repository initially require an internet connection. Offline usage applies to running the built application.

## Deployment

The project is configured for deployment on GitHub Pages.

**Live application:**

https://anewhope2005.github.io/JaDarsi/

The production build is generated using Vite and deployed from the `dist/` directory.

## Data Storage

User preferences and learning data are stored locally in the browser using `localStorage`.

This means data is associated with the browser and device being used. It is not automatically synchronized across devices or browsers.

## License

No license has been specified yet.