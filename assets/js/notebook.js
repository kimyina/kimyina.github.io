(() => {
  const categoryGroups = [...document.querySelectorAll('[data-category]')];
  if (categoryGroups.length) {
    const selectCategory = () => {
      let selected = '';
      try { selected = decodeURIComponent(location.hash.slice(1)); } catch (_) {}
      const matched = categoryGroups.some(group => group.dataset.category === selected);
      categoryGroups.forEach(group => { group.hidden = group.dataset.category !== selected; });
      document.getElementById('category-selection-hint').hidden = matched;
      document.querySelectorAll('.sidebar-category-group a').forEach(link => {
        if (link.hash.slice(1) === selected) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
      const outline = document.getElementById('document-toc');
      if (outline) {
        outline.replaceChildren();
        const activeGroup = categoryGroups.find(group => group.dataset.category === selected);
        const posts = activeGroup ? [...activeGroup.querySelectorAll('.archive-entry h3 a')] : [];
        if (posts.length) {
          const label = document.createElement('p');
          label.className = 'sidebar-label';
          label.textContent = '글 목록';
          outline.append(label);
          posts.forEach(post => {
            const link = document.createElement('a');
            link.href = post.href;
            link.textContent = post.textContent.replace(/\s*↗\s*$/, '').trim();
            outline.append(link);
          });
        }
      }
    };
    selectCategory();
    window.addEventListener('hashchange', selectCategory);
    return;
  }
  const tagGroups = [...document.querySelectorAll('[data-tag]')];
  if (tagGroups.length) {
    const selectTag = () => {
      let selected = '';
      try { selected = decodeURIComponent(location.hash.slice(1)); } catch (_) {}
      const matched = tagGroups.some(group => group.dataset.tag === selected);
      tagGroups.forEach(group => { group.hidden = group.dataset.tag !== selected; });
      document.getElementById('tag-selection-hint').hidden = matched;
      const tagMenu = document.querySelector('.sidebar-tags');
      if (tagMenu) {
        tagMenu.open = true;
        tagMenu.querySelectorAll('a').forEach(link => {
          if (link.hash.slice(1) === selected) link.setAttribute('aria-current', 'true');
          else link.removeAttribute('aria-current');
        });
      }
    };
    selectTag();
    window.addEventListener('hashchange', selectTag);
    return;
  }
  const outline = document.getElementById('document-toc');
  const headings = [...document.querySelectorAll('.document-content h2')];
  if (!outline || !headings.length) return;
  const label = document.createElement('p');
  label.className = 'sidebar-label';
  label.textContent = '이 페이지';
  outline.append(label);
  headings.forEach((heading, index) => {
    if (!heading.id) heading.id = `section-${index + 1}`;
    const link = document.createElement('a');
    link.href = `#${encodeURIComponent(heading.id)}`;
    const textHeading = heading.cloneNode(true);
    textHeading.querySelectorAll('[aria-hidden="true"]').forEach(node => node.remove());
    link.textContent = textHeading.textContent.trim();
    outline.append(link);
  });
})();
