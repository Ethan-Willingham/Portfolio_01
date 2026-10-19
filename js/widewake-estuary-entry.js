/* Keep old bookmarks on the game. The isolated navigation harness is test-only. */
if(!new URLSearchParams(location.search).has('test'))location.replace('widewake.html');
