-- Insert sample scenarios for Facebook and Twitter platforms

-- Facebook Scenario 1: Search, Like, Comment
INSERT INTO scenarios (name, platform, interaction_flow_json, targeting_rules, created_at, updated_at)
VALUES (
  'Facebook Engagement - Search Like Comment',
  'facebook',
  '[
    {
      "step": 1,
      "action": "search",
      "query": "technology news",
      "filters": {}
    },
    {
      "step": 2,
      "action": "like",
      "target": "search_results[0]",
      "entity_type": "post"
    },
    {
      "step": 3,
      "action": "comment",
      "target": "search_results[0]",
      "entity_type": "post",
      "generate_comment": true
    }
  ]'::jsonb,
  '{
    "keywords": ["technology", "news"],
    "demographics": {
      "interests": ["technology", "innovation"]
    }
  }'::jsonb,
  NOW(),
  NOW()
);

-- Facebook Scenario 2: Search, Like Multiple Posts
INSERT INTO scenarios (name, platform, interaction_flow_json, targeting_rules, created_at, updated_at)
VALUES (
  'Facebook Engagement - Multiple Likes',
  'facebook',
  '[
    {
      "step": 1,
      "action": "search",
      "query": "social media trends",
      "filters": {}
    },
    {
      "step": 2,
      "action": "like",
      "target": "search_results[0]",
      "entity_type": "post"
    },
    {
      "step": 3,
      "action": "like",
      "target": "search_results[1]",
      "entity_type": "post"
    }
  ]'::jsonb,
  '{
    "keywords": ["social media", "trends"],
    "hashtags": ["#socialmedia", "#trending"]
  }'::jsonb,
  NOW(),
  NOW()
);

-- Twitter Scenario 1: Search, Like, Reply
INSERT INTO scenarios (name, platform, interaction_flow_json, targeting_rules, created_at, updated_at)
VALUES (
  'Twitter Engagement - Search Like Reply',
  'twitter',
  '[
    {
      "step": 1,
      "action": "search",
      "query": "AI technology",
      "filters": {}
    },
    {
      "step": 2,
      "action": "like",
      "target": "search_results[0]",
      "entity_type": "post"
    },
    {
      "step": 3,
      "action": "reply",
      "target": "search_results[0]",
      "entity_type": "post",
      "generate_comment": true
    }
  ]'::jsonb,
  '{
    "keywords": ["AI", "technology", "artificial intelligence"],
    "hashtags": ["#AI", "#technology"]
  }'::jsonb,
  NOW(),
  NOW()
);

-- Twitter Scenario 2: Search and Comment
INSERT INTO scenarios (name, platform, interaction_flow_json, targeting_rules, created_at, updated_at)
VALUES (
  'Twitter Engagement - Search Comment',
  'twitter',
  '[
    {
      "step": 1,
      "action": "search",
      "query": "web development",
      "filters": {}
    },
    {
      "step": 2,
      "action": "comment",
      "target": "search_results[0]",
      "entity_type": "post",
      "generate_comment": true
    }
  ]'::jsonb,
  '{
    "keywords": ["web development", "programming", "coding"],
    "hashtags": ["#webdev", "#coding"]
  }'::jsonb,
  NOW(),
  NOW()
);

-- Twitter Scenario 3: Search, Like, Report (for moderation)
INSERT INTO scenarios (name, platform, interaction_flow_json, targeting_rules, created_at, updated_at)
VALUES (
  'Twitter Moderation - Search Report',
  'twitter',
  '[
    {
      "step": 1,
      "action": "search",
      "query": "spam content",
      "filters": {}
    },
    {
      "step": 2,
      "action": "report",
      "target": "search_results[0]",
      "entity_type": "post"
    }
  ]'::jsonb,
  '{
    "keywords": ["spam"],
    "demographics": {
      "interests": []
    }
  }'::jsonb,
  NOW(),
  NOW()
);

