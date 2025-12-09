#!/usr/bin/env node

/**
 * SVG Validation Script
 *
 * Validates SVG files for common issues including:
 * - Duplicate IDs
 * - Missing viewBox
 * - Invalid elements
 *
 * Usage:
 *   node scripts/validate-svg.js <file.svg> [options]
 *   node scripts/validate-svg.js --help
 *
 * Options:
 *   --fix       Fix duplicate IDs in place
 *   --verbose   Show detailed output
 *   --json      Output results as JSON
 */

const fs = require('fs')
const path = require('path')
const cheerio = require('cheerio')

// Parse command line arguments
const args = process.argv.slice(2)
const flags = {
  fix: args.includes('--fix'),
  verbose: args.includes('--verbose'),
  json: args.includes('--json'),
  help: args.includes('--help') || args.includes('-h')
}
const files = args.filter(arg => !arg.startsWith('--') && !arg.startsWith('-'))

// Show help
if (flags.help || files.length === 0) {
  console.log(`
SVG Validator - Check SVG files for common issues

Usage:
  node scripts/validate-svg.js <file.svg> [options]
  node scripts/validate-svg.js *.svg --verbose

Options:
  --fix       Fix duplicate IDs by appending unique suffixes
  --verbose   Show detailed information about each issue
  --json      Output results as JSON
  --help, -h  Show this help message

Examples:
  node scripts/validate-svg.js output.svg
  node scripts/validate-svg.js output.svg --fix
  node scripts/validate-svg.js *.svg --json
`)
  process.exit(flags.help ? 0 : 1)
}

// Generate a random suffix for fixing duplicates
function randomSuffix() {
  return Math.random().toString(36).substr(2, 6)
}

// Validate a single SVG file
function validateSvg(filePath) {
  const result = {
    file: filePath,
    valid: true,
    issues: [],
    stats: {
      totalElements: 0,
      elementsWithIds: 0,
      uniqueIds: 0,
      duplicateIds: 0,
      duplicateIdList: []
    },
    fixed: false
  }

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    result.valid = false
    result.issues.push({ type: 'error', message: `File not found: ${filePath}` })
    return result
  }

  // Read and parse SVG
  let svgContent
  try {
    svgContent = fs.readFileSync(filePath, 'utf8')
  } catch (err) {
    result.valid = false
    result.issues.push({ type: 'error', message: `Cannot read file: ${err.message}` })
    return result
  }

  const $ = cheerio.load(svgContent, { xmlMode: true })
  const svg = $('svg')

  if (svg.length === 0) {
    result.valid = false
    result.issues.push({ type: 'error', message: 'No <svg> element found' })
    return result
  }

  // Count elements
  result.stats.totalElements = $('*').length

  // Check for viewBox
  if (!svg.attr('viewBox')) {
    result.issues.push({
      type: 'warning',
      message: 'Missing viewBox attribute on <svg> element'
    })
  }

  // Check for duplicate IDs
  const idMap = new Map()
  $('[id]').each((_, el) => {
    const id = $(el).attr('id')
    if (!idMap.has(id)) {
      idMap.set(id, [])
    }
    idMap.get(id).push(el)
  })

  result.stats.elementsWithIds = $('[id]').length
  result.stats.uniqueIds = idMap.size

  // Find duplicates
  const duplicates = []
  for (const [id, elements] of idMap) {
    if (elements.length > 1) {
      duplicates.push({ id, count: elements.length, elements })
      result.stats.duplicateIdList.push({ id, count: elements.length })
    }
  }
  result.stats.duplicateIds = duplicates.length

  if (duplicates.length > 0) {
    result.valid = false

    for (const { id, count } of duplicates) {
      result.issues.push({
        type: 'error',
        message: `Duplicate ID "${id}" found ${count} times`
      })
    }

    // Fix duplicates if requested
    if (flags.fix) {
      for (const { id, elements } of duplicates) {
        // Keep first, rename rest
        for (let i = 1; i < elements.length; i++) {
          const newId = `${id}-${randomSuffix()}`
          $(elements[i]).attr('id', newId)
        }
      }

      // Write fixed file
      try {
        fs.writeFileSync(filePath, $.xml())
        result.fixed = true
        result.issues.push({
          type: 'info',
          message: `Fixed ${duplicates.length} duplicate ID(s)`
        })
      } catch (err) {
        result.issues.push({
          type: 'error',
          message: `Failed to write fixed file: ${err.message}`
        })
      }
    }
  }

  // Check for problematic patterns
  const autoGenIds = $('[id]').filter((_, el) => {
    const id = $(el).attr('id')
    return /^(node-\d+|svg-)/.test(id)
  }).length

  if (autoGenIds > 0 && flags.verbose) {
    result.issues.push({
      type: 'info',
      message: `Found ${autoGenIds} auto-generated ID(s) (node-*, svg-*)`
    })
  }

  return result
}

// Main execution
const results = files.map(validateSvg)

// Output results
if (flags.json) {
  console.log(JSON.stringify(results, null, 2))
} else {
  let hasErrors = false

  for (const result of results) {
    const icon = result.valid ? '✓' : '✗'
    const color = result.valid ? '\x1b[32m' : '\x1b[31m'
    const reset = '\x1b[0m'

    console.log(`${color}${icon}${reset} ${result.file}`)

    if (flags.verbose || !result.valid) {
      for (const issue of result.issues) {
        const prefix = issue.type === 'error' ? '  ✗' :
                      issue.type === 'warning' ? '  ⚠' : '  ℹ'
        const issueColor = issue.type === 'error' ? '\x1b[31m' :
                          issue.type === 'warning' ? '\x1b[33m' : '\x1b[36m'
        console.log(`${issueColor}${prefix}${reset} ${issue.message}`)
      }

      if (flags.verbose) {
        console.log(`    Elements: ${result.stats.totalElements}`)
        console.log(`    IDs: ${result.stats.elementsWithIds} (${result.stats.uniqueIds} unique)`)
        if (result.stats.duplicateIds > 0) {
          console.log(`    Duplicates: ${result.stats.duplicateIds}`)
        }
      }
    }

    if (!result.valid) {
      hasErrors = true
    }
  }

  // Summary
  if (results.length > 1) {
    const valid = results.filter(r => r.valid).length
    const invalid = results.length - valid
    console.log(`\nSummary: ${valid} valid, ${invalid} invalid`)
  }

  process.exit(hasErrors ? 1 : 0)
}
