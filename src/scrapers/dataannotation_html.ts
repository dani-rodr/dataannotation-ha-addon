// @ts-nocheck

function extractDataProps(html, rootId) {
  const openingTag = findElementOpeningTag(html, rootId);
  if (!openingTag) {
    throw new Error(`DataAnnotation page is missing ${rootId}`);
  }

  const attributes = parseAttributes(openingTag);
  const rawProps = attributes['data-props'];
  if (!rawProps) {
    throw new Error(`DataAnnotation page is missing data-props for ${rootId}`);
  }

  try {
    return JSON.parse(decodeHtmlEntities(rawProps));
  } catch (error) {
    throw new Error(`DataAnnotation page has invalid data-props for ${rootId}: ${error.message}`);
  }
}

function extractProjectsPage(html, pageUrl = null) {
  return {
    props: extractDataProps(html, 'workers/WorkerProjectsTable-hybrid-root'),
    pageUrl,
  };
}

function extractPaymentsPage(html, pageUrl = null) {
  const props = extractDataProps(html, 'workers/TransferFundsPage-hybrid-root');
  const buttons = extractButtons(html);
  const bodyText = stripHtml(html);

  return {
    props,
    buttons,
    nextWithdrawalText: bodyText.match(/Next withdrawal:\s+[^<]+?(?:GMT[+-]\d{1,2}(?::\d{2})?)/i)?.[0]?.trim() || '',
    pageUrl,
  };
}

function extractButtons(html) {
  const buttons = [];
  const formPattern = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let formMatch;

  while ((formMatch = formPattern.exec(String(html || '')))) {
    const formAttributes = parseAttributes(formMatch[1]);
    for (const button of extractButtonTags(formMatch[2])) {
      buttons.push({
        ...button,
        formAction: formAttributes.action || '',
        formMethod: formAttributes.method || '',
      });
    }
  }

  const formsRemoved = String(html || '').replace(formPattern, '');
  buttons.push(...extractButtonTags(formsRemoved));
  return buttons;
}

function extractButtonTags(html) {
  const buttons = [];
  const buttonPattern = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  let match;

  while ((match = buttonPattern.exec(String(html || '')))) {
    const attributes = parseAttributes(match[1]);
    buttons.push({
      text: stripHtml(match[2]),
      disabled: Object.prototype.hasOwnProperty.call(attributes, 'disabled'),
      ariaDisabled: attributes['aria-disabled'] || '',
      ariaLabel: attributes['aria-label'] || '',
      title: attributes.title || '',
      formAction: '',
      formMethod: '',
    });
  }

  return buttons;
}

function findElementOpeningTag(html, rootId) {
  const tags = String(html || '').match(/<div\b[^>]*>/gi) || [];
  return tags.find((tag) => parseAttributes(tag).id === rootId) || null;
}

function parseAttributes(tag) {
  const attributes = {};
  const attributePattern = /([:\w-]+)(?:\s*=\s*(?:"([\s\S]*?)"|'([\s\S]*?)'|([^\s>]+)))?/g;
  let match;

  while ((match = attributePattern.exec(String(tag || '')))) {
    const [, name, doubleQuoted, singleQuoted, unquoted] = match;
    attributes[name.toLowerCase()] = decodeHtmlEntities(doubleQuoted ?? singleQuoted ?? unquoted ?? '');
  }

  return attributes;
}

function stripHtml(value) {
  return decodeHtmlEntities(String(value || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

module.exports = {
  extractProjectsPage,
  extractPaymentsPage,
};
