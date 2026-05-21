'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function pushText(target, value, source = '') {
  const text = normalizeText(value);
  if (!text) return;
  target.push({ text, source });
}

function collectCmoMarketingTexts(snapshot = {}) {
  const items = [];
  const social = asObject(snapshot.socialPostPack);
  for (const post of asArray(social.posts)) {
    pushText(items, post.caption, `social:${post.platform || post.id}`);
    pushText(items, post.hook, `social-hook:${post.id}`);
    pushText(items, post.firstComment, `social-comment:${post.id}`);
  }

  const seo = asObject(snapshot.seoBrief);
  for (const article of asArray(seo.articles)) {
    pushText(items, article.title, `seo:title:${article.id}`);
    pushText(items, article.metaDescription, `seo:meta:${article.id}`);
  }

  const ads = asObject(snapshot.adCopyPack);
  for (const ad of asArray(ads.ads)) {
    for (const headline of asArray(ad.headlines)) {
      pushText(items, headline, `ad:headline:${ad.id}`);
    }
    for (const description of asArray(ad.descriptions)) {
      pushText(items, description, `ad:description:${ad.id}`);
    }
    pushText(items, ad.cta, `ad:cta:${ad.id}`);
  }

  const emails = asObject(snapshot.emailDrafts);
  for (const email of asArray(emails.emails)) {
    pushText(items, email.subject, `email:subject:${email.id}`);
    pushText(items, email.preheader, `email:preheader:${email.id}`);
    for (const line of asArray(email.bodyOutline)) {
      pushText(items, line, `email:body:${email.id}`);
    }
  }

  const repurpose = asObject(snapshot.repurposedContent);
  for (const variant of asArray(repurpose.variants)) {
    pushText(items, variant.text, `repurpose:${variant.channel}`);
    for (const tweet of asArray(variant.tweets)) {
      pushText(items, tweet, `repurpose:x:${variant.channel}`);
    }
    for (const slide of asArray(variant.slides)) {
      pushText(items, slide, `repurpose:slide:${variant.channel}`);
    }
  }

  for (const campaign of asArray(snapshot.campaigns)) {
    pushText(items, campaign.subject, `campaign:subject:${campaign.id}`);
    pushText(items, campaign.bodyOutline, `campaign:outline:${campaign.id}`);
    pushText(items, campaign.name, `campaign:name:${campaign.id}`);
  }

  for (const topic of asArray(snapshot.contentTopics)) {
    pushText(items, topic.topic, `topic:${topic.source || 'brief'}`);
  }

  return items;
}

function joinCollectedTexts(items = []) {
  return asArray(items)
    .map((item) => normalizeText(item?.text))
    .filter(Boolean)
    .join('\n');
}

module.exports = {
  collectCmoMarketingTexts,
  joinCollectedTexts,
};
