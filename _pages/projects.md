---
title: Projects
permalink: /projects/
layout: archive
author_profile: true
---

{% assign project_posts = site.categories.Projects %}
{% for post in project_posts %}
  {% include archive-single.html type="grid" %}
{% endfor %}
